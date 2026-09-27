import "server-only";
import { conflict, denied, OpError, systemCtx, type Ctx } from "../context";
import { kick } from "../kick";
import type { ActionAttempt, Output, Request, ReviewSubmission, Task } from "../types";
import { assert, getOr404, log, nameOf, notify, now, truncate } from "./common";
import { delegateTaskToAgent, onTaskDone, reevaluateTask, unmetPrerequisites } from "./tasks";
import { decideGate } from "./case-engine";

/** Ask a person for information directly. No agent is needed. */
export async function createInformationRequest(
  ctx: Ctx,
  args: {
    recipient_id: string;
    question: string;
    reason?: string;
    context_excerpt?: string;
    task_id?: string | null;
    output_id?: string | null;
  },
) {
  const question = args.question.trim();
  assert(question, new OpError("Say what you need to know."));
  assert(args.recipient_id !== ctx.me.user_id, new OpError("Choose someone other than yourself."));
  const { data: recipient } = await ctx.db.from("members").select("*").eq("user_id", args.recipient_id).maybeSingle();
  assert(recipient && recipient.status === "active", new OpError("That person isn't an active member."));

  if (args.task_id) await getOr404<Task>(ctx, "tasks", args.task_id, "This task");
  if (args.output_id) await getOr404<Output>(ctx, "outputs", args.output_id, "This document");

  const { data: req, error } = await ctx.db
    .from("requests")
    .insert({
      org_id: ctx.me.org_id,
      type: "information",
      recipient_id: recipient.user_id,
      requester_kind: "person",
      requester_id: ctx.me.user_id,
      question,
      reason: args.reason?.trim() ?? "",
      // Only this excerpt travels with the request; it doesn't open the whole task.
      context_excerpt: args.context_excerpt?.trim() ?? "",
      task_id: args.task_id ?? null,
      output_id: args.output_id ?? null,
    })
    .select()
    .single();
  if (error) throw new OpError(error.message);

  await notify(ctx, recipient.user_id, {
    kind: "request",
    title: `${ctx.me.full_name} needs information`,
    body: truncate(question, 140),
    link: `/inbox?request=${req.id}`,
  });
  await log(ctx, {
    verb: "asked",
    summary: `Asked ${recipient.full_name}: ${truncate(question, 120)}`,
    subject_kind: "request",
    subject_id: req.id,
  });
  return { request_id: req.id as string };
}

export async function withdrawRequest(ctx: Ctx, args: { request_id: string }) {
  const req = await getOr404<Request>(ctx, "requests", args.request_id, "This request");
  assert(req.requester_id === ctx.me.user_id, denied("Only the person who asked can withdraw this request."));
  assert(req.type === "information", new OpError("Reviews and approvals are withdrawn from their subject."));
  const upd = await ctx.db
    .from("requests")
    .update({ status: "Withdrawn", updated_at: now() })
    .eq("id", req.id)
    .eq("status", "Open")
    .select("id");
  assert(upd.data?.length, conflict("This request is no longer open."));
  await log(ctx, {
    verb: "withdrew",
    summary: `Withdrew the request “${truncate(req.question, 80)}”`,
    subject_kind: "request",
    subject_id: req.id,
    mission_id: req.mission_id,
  });
  return { ok: true };
}

export type Respond =
  | { kind: "answer"; text: string; evidence?: { title: string; content: string } | null }
  | { kind: "dont_know"; text?: string }
  | { kind: "suggest"; suggested_user_id: string; text?: string }
  | { kind: "accept"; text?: string }
  | { kind: "request_changes"; text: string }
  | { kind: "approve"; text?: string }
  | { kind: "decline"; text?: string };

const ALLOWED: Record<Request["type"], Respond["kind"][]> = {
  information: ["answer", "dont_know", "suggest"],
  review: ["accept", "request_changes"],
  authorization: ["approve", "decline"],
};

/**
 * Record a response against the displayed request. The update is conditional on
 * the request still being Open, so a stale panel can't decide a withdrawn,
 * superseded, or already-answered request.
 */
export async function respond(ctx: Ctx, args: { request_id: string; response: Respond }) {
  const req = await getOr404<Request>(ctx, "requests", args.request_id, "This request");
  // The demo account answers for whoever the request names; the response still records who typed it.
  assert(
    req.recipient_id === ctx.me.user_id || ctx.me.is_demo,
    denied(`Only ${await nameOf(ctx, req.recipient_id)} can respond to this request.`),
  );
  const r = args.response;
  assert(ALLOWED[req.type].includes(r.kind), new OpError("That response doesn't apply to this kind of request."));
  if (req.status !== "Open") {
    throw conflict(
      req.status === "Superseded"
        ? "This request was replaced by a newer one. Your response wasn't recorded against the replacement."
        : `This request is ${req.status.toLowerCase()}. Nothing was recorded.`,
    );
  }
  if (r.kind === "answer") assert(r.text.trim(), new OpError("Write your answer, or choose “I don't know”."));
  if (r.kind === "request_changes") assert(r.text.trim(), new OpError("Explain what needs to change."));
  if (r.kind === "suggest") assert(r.suggested_user_id, new OpError("Choose who might know."));

  let evidenceSourceId: string | null = null;
  if (r.kind === "answer" && r.evidence?.content.trim()) {
    evidenceSourceId = await attachEvidence(ctx, req, r.evidence);
  }

  const upd = await ctx.db
    .from("requests")
    .update({
      status: "Resolved",
      response_kind: r.kind,
      response_text: "text" in r ? (r.text ?? null) : null,
      response_evidence_source_id: evidenceSourceId,
      suggested_user_id: r.kind === "suggest" ? r.suggested_user_id : null,
      responded_by: ctx.me.user_id,
      responded_at: now(),
      updated_at: now(),
    })
    .eq("id", req.id)
    .eq("status", "Open")
    .select("id");
  assert(upd.data?.length, conflict("This request changed while you were responding. Nothing was recorded."));

  switch (req.type) {
    case "information":
      return afterInformation(ctx, req, r);
    case "review":
      return afterReview(ctx, req, r as Extract<Respond, { kind: "accept" | "request_changes" }>);
    case "authorization":
      return afterAuthorization(ctx, req, r as Extract<Respond, { kind: "approve" | "decline" }>);
  }
}

async function attachEvidence(ctx: Ctx, req: Request, evidence: { title: string; content: string }) {
  const { data: src, error } = await ctx.db
    .from("sources")
    .insert({
      org_id: ctx.me.org_id,
      title: evidence.title.trim() || "Attached evidence",
      kind: "document",
      origin: `Attached by ${ctx.me.full_name} to a request`,
      content: evidence.content,
      restricted: true,
      owner_id: ctx.me.user_id,
      observed_at: now(),
    })
    .select()
    .single();
  if (error) throw new OpError(error.message);
  // Evidence is visible to whoever asked.
  const grantees = new Set<string>();
  if (req.requester_id) grantees.add(req.requester_id);
  grantees.delete(ctx.me.user_id);
  if (grantees.size) {
    await ctx.db
      .from("source_grants")
      .insert([...grantees].map((user_id) => ({ source_id: src.id, user_id, granted_by: ctx.me.user_id })));
  }
  return src.id as string;
}

/**
 * An agent that asked a question is waiting on the answer. Once its last open question on the task
 * is answered, queue a contribution run: it re-reads every answer and saves a new version of its
 * document. (reevaluateTask skips tasks that already have a draft, so it can't do this.)
 */
async function resumeAgentAfterAnswer(ctx: Ctx, req: Request): Promise<boolean> {
  if (req.requester_kind !== "agent" || !req.assignment_id || !req.task_id) return false;
  // The person answering usually can't see the agent's task or assignment (RLS); respond() has
  // already checked they're the recipient, so the hand-back runs with system access.
  const sys = await systemCtx();
  const [{ data: task }, { data: a }] = await Promise.all([
    sys.db.from("tasks").select("id,title,status,assignment_id,procedure_revision_id").eq("id", req.task_id).maybeSingle(),
    sys.db.from("assignments").select("id,org_id,status,task_id").eq("id", req.assignment_id).maybeSingle(),
  ]);
  if (!task || !a || a.status !== "Active" || a.task_id !== task.id) return false;
  if (["Done", "Cancelled", "InReview"].includes(task.status)) return false;

  // A case step held by this question is no longer blocked by it.
  await sys.db.from("case_steps").update({ status: "NotStarted", request_id: null, updated_at: now() }).eq("request_id", req.id);

  const { data: stillOpen } = await sys.db
    .from("requests")
    .select("id,recipient_id")
    .eq("task_id", task.id)
    .eq("type", "information")
    .eq("status", "Open");
  if (stillOpen?.length) {
    const names = await Promise.all(stillOpen.map((x) => nameOf(sys, x.recipient_id)));
    await sys.db.from("assignments").update({ condition: `Waiting for ${[...new Set(names)].join(", ")} to answer`, updated_at: now() }).eq("id", a.id);
    return false;
  }
  if (await unmetPrerequisites(sys, task.id).then((u) => u.length > 0)) return false;

  const { data: live } = await sys.db.from("runs").select("id").eq("assignment_id", a.id).in("status", ["Queued", "Running"]);
  if (live?.length) return true; // a run already in flight reads the answer when it builds its context

  // A case is reviewed as a whole; other work resumes by redoing its contribution.
  const isCase = Boolean(task.procedure_revision_id);
  const { error } = await sys.db.from("runs").insert({
    org_id: a.org_id,
    assignment_id: a.id,
    trigger: isCase ? "case" : "contribution",
    instruction: isCase
      ? `${ctx.me.full_name} answered: ${truncate(req.question, 200)}`
      : `Update the contribution with ${ctx.me.full_name}'s answer to: ${truncate(req.question, 200)}`,
    inputs: { task_id: task.id, answered_request_id: req.id },
    created_by: ctx.me.user_id,
  });
  if (error) return false;
  await sys.db
    .from("assignments")
    .update({ condition: isCase ? `Reviewing the case after ${ctx.me.full_name}'s answer` : `Updating the contribution with ${ctx.me.full_name}'s answer`, updated_at: now() })
    .eq("id", a.id);
  if (task.status === "Open") await sys.db.from("tasks").update({ status: "InProgress", updated_at: now() }).eq("id", task.id);
  await log(sys, {
    actor_id: ctx.me.user_id,
    verb: "resumed",
    summary: `${ctx.me.full_name} answered — the agent is ${isCase ? "reviewing" : "updating"} “${task.title}”`,
    subject_kind: "task",
    subject_id: task.id,
    mission_id: req.mission_id,
    assignment_id: a.id,
  });
  kick();
  return true;
}

async function afterInformation(ctx: Ctx, req: Request, r: Respond) {
  const requesterName = req.requester_id ? await nameOf(ctx, req.requester_id) : "the requester";
  let message: string;
  if (r.kind === "answer") {
    message = "Answer recorded. It's available to the activity that asked for it.";
    await log(ctx, {
      verb: "answered",
      summary: `Answered “${truncate(req.question, 80)}”: ${truncate(r.text, 120)}`,
      subject_kind: "request",
      subject_id: req.id,
      mission_id: req.mission_id,
    });
  } else if (r.kind === "dont_know") {
    message = `Response recorded. The information is still needed — ${requesterName} will see that it's unresolved. You won't be asked the same question again.`;
    await log(ctx, {
      verb: "answered",
      summary: `Couldn't answer “${truncate(req.question, 80)}”. The information need is still open.`,
      subject_kind: "request",
      subject_id: req.id,
      mission_id: req.mission_id,
    });
  } else {
    const suggested = await nameOf(ctx, (r as { suggested_user_id: string }).suggested_user_id);
    message = `Suggestion recorded. ${requesterName} will decide whether to ask ${suggested}; nothing was sent to them or shared.`;
    await log(ctx, {
      verb: "suggested",
      summary: `Suggested asking ${suggested} about “${truncate(req.question, 80)}”. No request was sent.`,
      subject_kind: "request",
      subject_id: req.id,
      mission_id: req.mission_id,
    });
  }
  await notify(ctx, req.requester_id, {
    kind: "request_response",
    title:
      r.kind === "answer"
        ? `${ctx.me.full_name} answered your question`
        : r.kind === "dont_know"
          ? `${ctx.me.full_name} doesn't know — the information is still needed`
          : `${ctx.me.full_name} suggested someone else`,
    body: truncate(req.question, 140),
    link: req.task_id ? `/tasks/${req.task_id}` : `/requests/${req.id}`,
  });
  if (req.task_id) {
    const resumed = r.kind === "suggest" ? false : await resumeAgentAfterAnswer(ctx, req);
    if (resumed) message = `${message} The agent is picking the work back up with your answer.`;
    else await reevaluateTask(ctx, req.task_id);
  }
  return { status: "Resolved", message };
}

async function afterReview(ctx: Ctx, req: Request, r: Extract<Respond, { kind: "accept" | "request_changes" }>) {
  assert(req.review_submission_id, new OpError("This review request has no submission."));
  const sub = await getOr404<ReviewSubmission>(ctx, "review_submissions", req.review_submission_id, "This review");
  const output = await getOr404<Output>(ctx, "outputs", sub.output_id, "This document");

  if (sub.status !== "Open") {
    // The request was still open but its submission has closed: keep the response as history only.
    return { status: "Resolved", message: `Response recorded as history. This submission is already ${sub.status}.` };
  }

  if (r.kind === "request_changes") {
    await ctx.db.from("review_submissions").update({ status: "ChangesRequested", closed_at: now() }).eq("id", sub.id).eq("status", "Open");
    await ctx.db
      .from("requests")
      .update({ status: "Withdrawn", updated_at: now() })
      .eq("review_submission_id", sub.id)
      .eq("status", "Open");
    const { data: tasks } = await ctx.db.from("tasks").select("*").eq("review_submission_id", sub.id).eq("status", "InReview");
    for (const t of (tasks ?? []) as Task[]) {
      await ctx.db.from("tasks").update({ status: "InProgress", review_satisfied: false, updated_at: now() }).eq("id", t.id);
      if (t.assignment_id) {
        await ctx.db
          .from("assignments")
          .update({ condition: `Revision requested by ${ctx.me.full_name}: ${truncate(r.text, 160)}`, updated_at: now() })
          .eq("id", t.assignment_id);
      }
    }
    await log(ctx, {
      verb: "requested_changes",
      summary: `Requested changes to “${output.title}” version ${sub.version}: ${truncate(r.text, 140)}`,
      subject_kind: "output",
      subject_id: output.id,
      mission_id: output.mission_id,
    });
    await notify(ctx, sub.requested_by, {
      kind: "review_decision",
      title: `${ctx.me.full_name} requested changes to “${output.title}”`,
      body: truncate(r.text, 160),
      link: `/outputs/${output.id}`,
    });
    return {
      status: "Resolved",
      message: `Changes requested on version ${sub.version}. The author can revise and submit a new version.`,
    };
  }

  // Accept: the submission is accepted only when every required reviewer has accepted.
  const { data: siblings } = await ctx.db.from("requests").select("*").eq("review_submission_id", sub.id);
  const accepted = new Set(
    ((siblings ?? []) as Request[]).filter((s) => s.response_kind === "accept").map((s) => s.recipient_id),
  );
  const allAccepted = sub.reviewer_ids.every((id) => accepted.has(id));
  await log(ctx, {
    verb: "accepted",
    summary: `Accepted “${output.title}” version ${sub.version}`,
    subject_kind: "output",
    subject_id: output.id,
    mission_id: output.mission_id,
  });

  if (!allAccepted) {
    const waiting = sub.reviewer_ids.length - accepted.size;
    return { status: "Resolved", message: `Your acceptance is recorded. ${waiting} required reviewer${waiting > 1 ? "s" : ""} still to decide.` };
  }

  await ctx.db.from("review_submissions").update({ status: "Accepted", closed_at: now() }).eq("id", sub.id).eq("status", "Open");
  const { data: tasks } = await ctx.db.from("tasks").select("*").eq("review_submission_id", sub.id).eq("status", "InReview");
  let taskNote = "";
  for (const t of (tasks ?? []) as Task[]) {
    const unmet = await unmetPrerequisites(ctx, t.id);
    if (unmet.length) {
      await ctx.db.from("tasks").update({ status: "InProgress", review_satisfied: true, updated_at: now() }).eq("id", t.id);
      taskNote = ` “${t.title}” still waits for ${unmet.map((u) => u.title).join(", ")}.`;
    } else {
      await ctx.db
        .from("tasks")
        .update({ status: "Done", review_satisfied: true, completed_at: now(), updated_at: now() })
        .eq("id", t.id);
      taskNote = ` “${t.title}” is done.`;
      if (t.assignment_id) {
        await ctx.db
          .from("assignments")
          .update({ status: "Ending", condition: "Contribution accepted", updated_at: now() })
          .eq("id", t.assignment_id)
          .eq("status", "Active");
        kick();
      }
      await log(ctx, {
        verb: "completed",
        summary: `“${t.title}” is done — version ${sub.version} was accepted`,
        subject_kind: "task",
        subject_id: t.id,
        mission_id: t.mission_id,
      });
      await onTaskDone(ctx, t.id);
    }
  }
  await notify(ctx, sub.requested_by, {
    kind: "review_decision",
    title: `“${output.title}” version ${sub.version} was accepted`,
    link: `/outputs/${output.id}`,
  });
  return { status: "Resolved", message: `Version ${sub.version} accepted.${taskNote} This doesn't authorize any external action.` };
}

async function afterAuthorization(ctx: Ctx, req: Request, r: Extract<Respond, { kind: "approve" | "decline" }>) {
  if (req.gate_key && req.task_id) {
    const { message } = await decideGate(ctx, req, r.kind === "approve", ctx.me.full_name);
    return { status: "Resolved", message };
  }
  if (!req.action_attempt_id && req.task_id) return afterTaskProposal(ctx, req, r);
  assert(req.action_attempt_id, new OpError("This approval has no proposed action."));
  const attempt = await getOr404<ActionAttempt>(ctx, "action_attempts", req.action_attempt_id, "This action");
  if (r.kind === "decline") {
    await ctx.db
      .from("action_attempts")
      .update({ status: "Declined", decided_by: ctx.me.user_id, decided_at: now(), updated_at: now() })
      .eq("id", attempt.id)
      .eq("status", "AwaitingAuthorization");
    await log(ctx, {
      verb: "declined",
      summary: `Declined: ${attempt.target_label} ${attempt.field} → ${attempt.proposed_value}. The action won't run.`,
      subject_kind: "request",
      subject_id: req.id,
      assignment_id: attempt.assignment_id,
    });
    return { status: "Resolved", message: "Declined. The proposed change will not be made." };
  }
  // Approval makes the action eligible. The worker rechecks current authority and
  // prerequisites before dispatch, then establishes the result from evidence.
  const upd = await ctx.db
    .from("action_attempts")
    .update({
      decided_by: ctx.me.user_id,
      decided_at: now(),
      authority_basis: `Approved by ${ctx.me.full_name} under the rule for ${attempt.operation}`,
      updated_at: now(),
    })
    .eq("id", attempt.id)
    .eq("status", "AwaitingAuthorization")
    .is("decided_at", null)
    .select("id");
  assert(upd.data?.length, conflict("This action is no longer awaiting a decision."));
  await log(ctx, {
    verb: "approved",
    summary: `Approved: ${attempt.target_label} ${attempt.field} → ${attempt.proposed_value}. Not yet carried out.`,
    subject_kind: "request",
    subject_id: req.id,
    assignment_id: attempt.assignment_id,
  });
  kick();
  return { status: "Resolved", message: "Approved — action not yet confirmed. Loura will recheck conditions, carry it out, and show the actual result." };
}

/** An agent proposed a task from a conversation. Approval starts the agent on it; declining cancels it. */
async function afterTaskProposal(ctx: Ctx, req: Request, r: Extract<Respond, { kind: "approve" | "decline" }>) {
  const task = await getOr404<Task>(ctx, "tasks", req.task_id!, "This task");
  if (r.kind === "decline") {
    await ctx.db.from("tasks").update({ status: "Cancelled", updated_at: now() }).eq("id", task.id);
    await log(ctx, { verb: "declined", summary: `Declined the proposed task “${task.title}”. It won't start.`, subject_kind: "task", subject_id: task.id });
    return { status: "Resolved", message: "Declined. The task was cancelled and won't start." };
  }
  // The task works from the same sources as the conversation it came from.
  const { data: origin } = req.assignment_id
    ? await ctx.db.from("assignments").select("conversation_id").eq("id", req.assignment_id).maybeSingle()
    : { data: null };
  const { data: convSources } = origin?.conversation_id
    ? await ctx.db.from("conversation_sources").select("source_id").eq("conversation_id", origin.conversation_id)
    : { data: [] };
  await log(ctx, { verb: "approved", summary: `Approved the task “${task.title}”.`, subject_kind: "task", subject_id: task.id });
  await delegateTaskToAgent(ctx, {
    task_id: task.id,
    agent_id: req.agent_id ?? task.agent_id!,
    source_ids: (convSources ?? []).map((s) => s.source_id),
  });
  return { status: "Resolved", message: "Approved. The agent has started the task." };
}

export async function markUpdateRead(ctx: Ctx, args: { update_id?: string; all?: boolean }) {
  const q = ctx.db.from("updates").update({ read_at: now() }).eq("user_id", ctx.me.user_id).is("read_at", null);
  if (!args.all) q.eq("id", args.update_id ?? "");
  await q;
  return { ok: true };
}
