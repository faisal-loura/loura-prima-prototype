import "server-only";
import type { Ctx } from "../context";
import { notFound } from "../context";
import type {
  Activity,
  CaseStep,
  Assignment,
  Conversation,
  Member,
  Message,
  Output,
  OutputComment,
  OutputGrant,
  OutputProposal,
  OutputVersion,
  Request,
  ReviewSubmission,
  Run,
  Task,
} from "../types";
import { lookup, type Lookup } from "./shared";
import type { CaseWorking } from "../domain/case-engine";
import { isTaskProposal } from "./hub";

/**
 * What each decision in a case rested on: one entry per gate, in the order they happened,
 * with the records that decision read and how its figures were worked out.
 */
function caseContext(reqs: Request[]) {
  type Item = {
    title: string;
    quote: string;
    kind: string;
    system: string;
    logo: string | null;
    ref: string;
    at: string | null;
    source_id: string | null;
    attachments: { name: string; kind: string }[];
  };
  return [...reqs]
    .filter((r) => r.gate_key)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((r) => {
      const data = (r.gate_data ?? {}) as { evidence?: Item[]; technical?: { label: string; value: string }[] };
      return {
        request_id: r.id,
        stage: r.gate_stage,
        decision: r.question,
        status: r.status,
        decided: r.response_kind === "approve" ? "Approved" : r.response_kind === "decline" ? "Sent back" : null,
        at: r.responded_at ?? r.created_at,
        evidence: (data.evidence ?? []).map((e) => ({ ...e, attachments: e.attachments ?? [] })),
        technical: data.technical ?? [],
      };
    })
    .filter((x) => x.evidence.length || x.technical.length);
}

function activityRows(L: Lookup, rows: Activity[]) {
  return rows.map((a) => ({
    id: a.id,
    actor: a.actor_kind === "agent" ? L.agent(a.agent_id) : a.actor_kind === "system" ? "Loura" : L.person(a.actor_id),
    actor_kind: a.actor_kind,
    verb: a.verb,
    summary: a.summary,
    subject_kind: a.subject_kind,
    subject_id: a.subject_id,
    created_at: a.created_at,
  }));
}
export type ActivityRow = ReturnType<typeof activityRows>[number];

function messageRows(L: Lookup, msgs: Message[], outputs: Pick<Output, "id" | "title">[]) {
  return msgs.map((msg) => ({
    id: msg.id,
    author_kind: msg.author_kind,
    author: msg.author_kind === "person" ? L.person(msg.author_id) : msg.author_kind === "agent" ? L.agent(msg.agent_id) : "Loura",
    is_me: false,
    body: msg.body,
    output: msg.output_id ? { id: msg.output_id, title: outputs.find((o) => o.id === msg.output_id)?.title ?? "Document" } : null,
    simulated: msg.simulated,
    run_id: msg.run_id,
    created_at: msg.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export async function task(ctx: Ctx, id: string) {
  const { data } = await ctx.db.from("tasks").select("*").eq("id", id).maybeSingle();
  if (!data) throw notFound("This task");
  const t = data as Task;
  const L = await lookup(ctx);
  const [depsRes, asgRes, outRes, subRes, reqRes, actRes] = await Promise.all([
    ctx.db.from("task_dependencies").select("depends_on_id").eq("task_id", t.id),
    t.assignment_id ? ctx.db.from("assignments").select("*").eq("id", t.assignment_id).maybeSingle() : Promise.resolve({ data: null }),
    t.output_id ? ctx.db.from("outputs").select("*").eq("id", t.output_id).maybeSingle() : Promise.resolve({ data: null }),
    t.review_submission_id ? ctx.db.from("review_submissions").select("*").eq("id", t.review_submission_id).maybeSingle() : Promise.resolve({ data: null }),
    ctx.db.from("requests").select("*").eq("task_id", t.id).order("created_at", { ascending: false }),
    ctx.db.from("activity").select("*").eq("subject_kind", "task").eq("subject_id", t.id).order("created_at", { ascending: false }).limit(30),
  ]);
  // A case carries its own steps: the procedure's stages, as state inside this one task.
  const [stepsRes, procRes] = t.procedure_revision_id
    ? await Promise.all([
        ctx.db.from("case_steps").select("*").eq("task_id", t.id).order("step_no"),
        ctx.db.from("procedure_revisions").select("id,procedures(name)").eq("id", t.procedure_revision_id).maybeSingle(),
      ])
    : [{ data: null }, { data: null }];

  const depIds = (depsRes.data ?? []).map((d) => d.depends_on_id);
  const depTasks = depIds.length ? ((await ctx.db.from("tasks").select("id,title,status").in("id", depIds)).data ?? []) : [];
  const a = asgRes.data as Assignment | null;
  const out = outRes.data as Output | null;
  const sub = subRes.data as ReviewSubmission | null;
  const reqs = (reqRes.data ?? []) as Request[];
  const approval = reqs.find((r) => r.status === "Open" && isTaskProposal(r));

  // The conversation the task came from — the task page's mini composer continues it.
  const { data: origin } = await ctx.db
    .from("assignments")
    .select("conversation_id")
    .eq("task_id", t.id)
    .not("conversation_id", "is", null)
    .limit(1)
    .maybeSingle();
  let conversation: { id: string; is_owner: boolean; working: boolean; messages: ReturnType<typeof messageRows> } | null = null;
  if (origin?.conversation_id) {
    const [{ data: conv }, { data: msgs }, { data: convAsg }] = await Promise.all([
      ctx.db.from("conversations").select("id,owner_id").eq("id", origin.conversation_id).maybeSingle(),
      ctx.db.from("messages").select("*").eq("conversation_id", origin.conversation_id).order("created_at", { ascending: false }).limit(4),
      ctx.db.from("assignments").select("id").eq("conversation_id", origin.conversation_id),
    ]);
    if (conv) {
      const rows = ((msgs ?? []) as Message[]).reverse();
      const live = convAsg?.length
        ? ((await ctx.db.from("runs").select("id").in("assignment_id", convAsg.map((x) => x.id)).in("status", ["Queued", "Running"])).data ?? [])
        : [];
      conversation = {
        id: conv.id,
        is_owner: conv.owner_id === ctx.me.user_id,
        working: live.length > 0,
        messages: messageRows(L, rows, []).map((m) => ({ ...m, is_me: rows.find((x) => x.id === m.id)?.author_id === ctx.me.user_id })),
      };
    }
  }
  // Every open request on a task holds it until someone answers.
  const blocking = reqs
    .filter((r) => r.status === "Open")
    .map((r) => ({
      id: r.id,
      kind: isTaskProposal(r) ? ("task" as const) : r.type,
      question: r.question,
      reason: r.reason,
      requester: r.requester_kind === "agent" ? L.agent(r.agent_id) : L.person(r.requester_id),
      recipient: L.person(r.recipient_id),
      is_recipient: r.recipient_id === ctx.me.user_id || ctx.me.is_demo,
      is_the_recipient: r.recipient_id === ctx.me.user_id,
      is_requester: r.requester_id === ctx.me.user_id,
      created_at: r.created_at,
    }))
    .sort((x, y) => x.created_at.localeCompare(y.created_at));
  return {
    task: t,
    performer: t.performer_kind === "agent" ? L.agent(t.agent_id) : t.performer_id ? L.person(t.performer_id) : null,
    responsible: L.person(t.responsible_id),
    is_performer: t.performer_id === ctx.me.user_id,
    is_responsible: t.responsible_id === ctx.me.user_id || t.created_by === ctx.me.user_id,
    unmet: depTasks.filter((d) => d.status !== "Done"),
    approval: approval ? { id: approval.id, recipient: L.person(approval.recipient_id) } : null,
    blocking,
    conversation,
    assignment: a ? { id: a.id, status: a.status, condition: a.condition, agent: L.agent(a.agent_id), responsible: L.person(a.responsible_id) } : null,
    output: out ? { id: out.id, title: out.title, version: out.current_version } : null,
    output_hidden: Boolean(t.output_id && !out),
    review: sub ? { id: sub.id, status: sub.status, version: sub.version, reviewers: sub.reviewer_ids.map((r) => L.person(r)) } : null,
    requests: reqs
      .filter((r) => !isTaskProposal(r))
      .map((r) => ({
        id: r.id,
        type: r.type,
        status: r.status,
        question: r.question,
        recipient: L.person(r.recipient_id),
        requester: r.requester_kind === "agent" ? L.agent(r.agent_id) : L.person(r.requester_id),
        response_kind: r.response_kind,
        response_text: r.response_text,
        is_requester: r.requester_id === ctx.me.user_id,
        created_at: r.created_at,
      })),
    activity: activityRows(L, (actRes.data ?? []) as Activity[]),
    kase: t.procedure_revision_id
      ? {
          ref: t.case_ref,
          path: t.case_path,
          facts: t.case_facts,
          working: ((t.case_facts ?? {}) as { working?: CaseWorking }).working ?? null,
          procedure: (procRes.data as { procedures?: { name: string } } | null)?.procedures?.name ?? "Procedure",
          steps: ((stepsRes.data ?? []) as CaseStep[]).map((s) => ({ ...s, updated_by_name: s.updated_by ? L.person(s.updated_by) : null })),
          // Everything the case's decisions have rested on so far, newest stage last.
          context: caseContext(reqs),
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Conversation
// ---------------------------------------------------------------------------

export async function conversation(ctx: Ctx, id: string) {
  const { data } = await ctx.db.from("conversations").select("*").eq("id", id).maybeSingle();
  if (!data) throw notFound("This conversation");
  const c = data as Conversation;
  const L = await lookup(ctx);
  const [msgs, asg] = await Promise.all([
    ctx.db.from("messages").select("*").eq("conversation_id", c.id).order("created_at"),
    ctx.db.from("assignments").select("*").eq("conversation_id", c.id),
  ]);
  const msgRows = (msgs.data ?? []) as Message[];
  const outIds = [...new Set(msgRows.map((m) => m.output_id).filter(Boolean))] as string[];
  const outs = outIds.length ? (((await ctx.db.from("outputs").select("id,title,current_version").in("id", outIds)).data ?? []) as Output[]) : [];
  const asgRows = (asg.data ?? []) as Assignment[];
  const runs = asgRows.length
    ? (((await ctx.db.from("runs").select("*").in("assignment_id", asgRows.map((a) => a.id)).order("created_at", { ascending: false }).limit(10)).data ?? []) as Run[])
    : [];
  const taskId = asgRows.find((a) => a.task_id)?.task_id;
  const task = taskId ? ((await ctx.db.from("tasks").select("id,title,status").eq("id", taskId).maybeSingle()).data as Pick<Task, "id" | "title" | "status"> | null) : null;

  // The approval request the agent raised when it proposed the task, shown under the
  // agent message that announced it (the first agent reply after the request was made).
  let proposal: {
    request_id: string;
    status: Request["status"];
    response_kind: Request["response_kind"];
    created_at: string;
    is_recipient: boolean;
    message_id: string | null;
  } | null = null;
  if (task) {
    const { data: reqs } = await ctx.db
      .from("requests")
      .select("*")
      .eq("task_id", task.id)
      .eq("type", "authorization")
      .is("action_attempt_id", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const req = (reqs?.[0] as Request | undefined) ?? null;
    if (req) {
      const after = new Date(req.created_at).getTime() - 60_000;
      const agentMsgs = msgRows.filter((m) => m.author_kind === "agent");
      const anchor = agentMsgs.find((m) => new Date(m.created_at).getTime() >= after) ?? agentMsgs[agentMsgs.length - 1] ?? null;
      proposal = {
        request_id: req.id,
        status: req.status,
        response_kind: req.response_kind,
        created_at: req.created_at,
        is_recipient: req.recipient_id === ctx.me.user_id || ctx.me.is_demo,
        message_id: anchor?.id ?? null,
      };
    }
  }

  return {
    conversation: c,
    is_owner: c.owner_id === ctx.me.user_id,
    messages: messageRows(L, msgRows, outs).map((m) => ({ ...m, is_me: msgRows.find((x) => x.id === m.id)?.author_id === ctx.me.user_id })),
    outputs: outs.map((o) => ({ id: o.id, title: o.title, version: o.current_version })),
    task,
    proposal,
    assignment: asgRows[0]
      ? { id: asgRows[0].id, status: asgRows[0].status, condition: asgRows[0].condition, agent: L.agent(asgRows[0].agent_id) }
      : null,
    working: runs.some((r) => r.status === "Queued" || r.status === "Running"),
    last_run: runs[0] ? { id: runs[0].id, status: runs[0].status, simulated: runs[0].simulated, error: runs[0].error } : null,
  };
}

// ---------------------------------------------------------------------------
// Output (document)
// ---------------------------------------------------------------------------

export async function output(ctx: Ctx, id: string, versionParam?: number) {
  const { data } = await ctx.db.from("outputs").select("*").eq("id", id).maybeSingle();
  if (!data) throw notFound("This document");
  const o = data as Output;
  const L = await lookup(ctx);
  const me = ctx.me.user_id;

  const [versions, grants, comments, subs, proposals, tasks, asg, canEditRes, activity] = await Promise.all([
    ctx.db.from("output_versions").select("*").eq("output_id", o.id).order("version", { ascending: false }),
    ctx.db.from("output_grants").select("*").eq("output_id", o.id),
    ctx.db.from("output_comments").select("*").eq("output_id", o.id).order("created_at"),
    ctx.db.from("review_submissions").select("*").eq("output_id", o.id).order("created_at", { ascending: false }),
    ctx.db.from("output_proposals").select("*").eq("output_id", o.id).order("created_at", { ascending: false }),
    ctx.db.from("tasks").select("id,title,status,requires_review,review_satisfied").eq("output_id", o.id),
    ctx.db.from("assignments").select("*").eq("output_id", o.id),
    ctx.db.rpc("can_edit_output", { oid: o.id }),
    ctx.db.from("activity").select("*").eq("subject_kind", "output").eq("subject_id", o.id).order("created_at", { ascending: false }).limit(40),
  ]);

  const versionRows = (versions.data ?? []) as OutputVersion[];
  const current = versionRows.find((v) => v.version === o.current_version) ?? versionRows[0];
  const viewing = versionParam ? (versionRows.find((v) => v.version === versionParam) ?? current) : current;

  // Source access is checked per source: sharing the document didn't share them.
  const refIds = [...new Set(viewing?.sources?.map((s) => s.source_id) ?? [])];
  const readable = refIds.length ? (((await ctx.db.from("sources").select("id").in("id", refIds)).data ?? []).map((s) => s.id)) : [];
  const records = refIds.length ? (((await ctx.db.from("sandbox_records").select("id").in("id", refIds)).data ?? []).map((s) => s.id)) : [];

  const subRows = (subs.data ?? []) as ReviewSubmission[];
  const subReqs = subRows.length
    ? (((await ctx.db.from("requests").select("*").in("review_submission_id", subRows.map((s) => s.id))).data ?? []) as Request[])
    : [];
  const asgRows = (asg.data ?? []) as Assignment[];
  const liveRuns = asgRows.length
    ? (((await ctx.db.from("runs").select("*").in("assignment_id", asgRows.map((a) => a.id)).in("status", ["Queued", "Running"])).data ?? []) as Run[])
    : [];

  return {
    output: o,
    can_edit: Boolean(canEditRes.data),
    is_owner: o.owner_id === me,
    owner: L.person(o.owner_id),
    current_version: current?.version ?? 1,
    viewing: viewing
      ? {
          ...viewing,
          author: viewing.author_kind === "agent" ? L.agent(viewing.agent_id) : L.person(viewing.author_id),
          // Restricted inputs are listed without their title: its name can itself be restricted information.
          sources: (viewing.sources ?? []).map((s) => {
            const ok = readable.includes(s.source_id) || records.includes(s.source_id) || s.kind === "connected_record";
            return ok ? { ...s, readable: true } : { source_id: s.source_id, title: "Restricted source", version: s.version, observed_at: null, kind: s.kind, readable: false };
          }),
        }
      : null,
    versions: versionRows.map((v) => ({
      version: v.version,
      author: v.author_kind === "agent" ? `${L.agent(v.agent_id)}${v.author_id ? ` · applied by ${L.person(v.author_id)}` : ""}` : L.person(v.author_id),
      author_kind: v.author_kind,
      note: v.note,
      locked: v.locked,
      created_at: v.created_at,
      updated_at: v.updated_at,
      reviewed: subRows.filter((s) => s.version === v.version).map((s) => s.status),
    })),
    audience: {
      owner: { user_id: o.owner_id, name: L.person(o.owner_id) },
      grants: ((grants.data ?? []) as OutputGrant[]).map((g) => ({ user_id: g.user_id, name: L.person(g.user_id), access: g.access, active: L.member(g.user_id)?.status === "active" })),
    },
    comments: ((comments.data ?? []) as OutputComment[]).map((c) => ({ ...c, author: L.person(c.author_id) })),
    reviews: subRows.map((s) => ({
      id: s.id,
      version: s.version,
      status: s.status,
      note: s.note,
      requested_by: L.person(s.requested_by),
      can_withdraw: s.status === "Open" && (s.requested_by === me || o.owner_id === me),
      created_at: s.created_at,
      closed_at: s.closed_at,
      reviewers: s.reviewer_ids.map((uid) => {
        const r = subReqs.find((x) => x.review_submission_id === s.id && x.recipient_id === uid);
        return { user_id: uid, name: L.person(uid), decision: r?.response_kind ?? null, text: r?.response_text ?? null, request_status: r?.status ?? null, request_id: r?.id ?? null, is_me: uid === me };
      }),
    })),
    proposals: ((proposals.data ?? []) as OutputProposal[]).map((p) => ({ ...p, agent: L.agent(p.agent_id), resolved_by: p.resolved_by ? L.person(p.resolved_by) : null })),
    base_contents: Object.fromEntries(versionRows.map((v) => [v.version, v.content])) as Record<number, string>,
    tasks: tasks.data ?? [],
    agent_working: liveRuns.map((r) => ({ run_id: r.id, trigger: r.trigger, status: r.status, base_version: (r.inputs as { base_version?: number }).base_version ?? null })),
    activity: activityRows(L, (activity.data ?? []) as Activity[]),
  };
}

export type { Member };
