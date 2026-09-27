import "server-only";
import { conflict, denied, OpError, type Ctx } from "../context";
import { kick } from "../kick";
import type { Agent, AgentRevision, Assignment, Conversation, Procedure, SandboxRecord } from "../types";
import { assert, getOr404, log, notify, now, truncate } from "./common";
import { defaultAgentId } from "./outputs";

// ---------------------------------------------------------------------------
// Conversations: the composer starts one. The agent may propose a task from it.
// ---------------------------------------------------------------------------

export async function ask(
  ctx: Ctx,
  args: { conversation_id?: string | null; text: string; client_key: string; agent_id?: string },
) {
  const text = args.text.trim();
  assert(text, new OpError("Write a question or instruction."));

  let conv: Conversation;
  if (args.conversation_id) {
    conv = await getOr404<Conversation>(ctx, "conversations", args.conversation_id, "This conversation");
  } else {
    // Retried first send: reuse the conversation created by the original attempt.
    const { data: prior } = await ctx.db
      .from("messages")
      .select("conversation_id")
      .eq("client_key", args.client_key)
      .eq("author_id", ctx.me.user_id)
      .maybeSingle();
    if (prior) return { conversation_id: prior.conversation_id as string, duplicate: true };
    const { data, error } = await ctx.db
      .from("conversations")
      .insert({ org_id: ctx.me.org_id, owner_id: ctx.me.user_id, title: truncate(text, 70) })
      .select()
      .single();
    if (error) throw new OpError(error.message);
    conv = data as Conversation;
  }

  // No source picking: the agent works from every source this person can read (RLS decides).
  const { data: permitted } = await ctx.db.from("sources").select("id");
  await ctx.db.from("conversation_sources").delete().eq("conversation_id", conv.id);
  if (permitted?.length) {
    await ctx.db.from("conversation_sources").insert(permitted.map((s) => ({ conversation_id: conv.id, source_id: s.id })));
  }

  // Idempotent send: a retry with the same client key doesn't create duplicate activity.
  const msg = await ctx.db
    .from("messages")
    .insert({
      conversation_id: conv.id,
      author_kind: "person",
      author_id: ctx.me.user_id,
      body: text,
      client_key: args.client_key,
    })
    .select()
    .single();
  if (msg.error) {
    if (msg.error.code === "23505") return { conversation_id: conv.id, duplicate: true };
    throw new OpError(msg.error.message);
  }
  await ctx.db.from("conversations").update({ updated_at: now() }).eq("id", conv.id);

  const agentId = args.agent_id ?? (await defaultAgentId(ctx, "Analysis agent"));
  const agent = await getOr404<Agent>(ctx, "agents", agentId, "This agent");
  assert(agent.published_revision_id, new OpError(`${agent.name} has no published revision available.`));

  const { data: existing } = await ctx.db
    .from("assignments")
    .select("*")
    .eq("conversation_id", conv.id)
    .eq("agent_id", agent.id)
    .limit(1);
  let assignment = existing?.[0] as Assignment | undefined;
  if (!assignment) {
    const ins = await ctx.db
      .from("assignments")
      .insert({
        org_id: ctx.me.org_id,
        agent_id: agent.id,
        agent_revision_id: agent.published_revision_id,
        kind: "contribution",
        purpose: `Help with: ${truncate(conv.title, 80)}`,
        instructions: text,
        status: "Active",
        responsible_id: ctx.me.user_id,
        created_by: ctx.me.user_id,
        conversation_id: conv.id,
        mission_id: conv.mission_id,
      })
      .select()
      .single();
    if (ins.error) throw new OpError(ins.error.message);
    assignment = ins.data as Assignment;
  } else if (assignment.status === "Ended") {
    await ctx.db.from("assignments").update({ status: "Active", ended_at: null, updated_at: now() }).eq("id", assignment.id);
  } else if (assignment.status !== "Active") {
    throw new OpError(`${agent.name}'s assignment in this conversation is ${assignment.status.toLowerCase()}. Resume it to continue.`);
  }

  const { data: selected } = await ctx.db.from("conversation_sources").select("source_id").eq("conversation_id", conv.id);
  await ctx.db.from("assignment_sources").upsert(
    (selected ?? []).map((s) => ({ assignment_id: assignment!.id, source_id: s.source_id })),
  );

  await ctx.db.from("runs").insert({
    org_id: ctx.me.org_id,
    assignment_id: assignment.id,
    trigger: "conversation",
    instruction: text,
    inputs: { conversation_id: conv.id, message_id: msg.data.id },
    created_by: ctx.me.user_id,
  });
  kick();
  return { conversation_id: conv.id };
}

// ---------------------------------------------------------------------------
// Ongoing assignments (journey C)
// ---------------------------------------------------------------------------

export async function startOngoingAssignment(
  ctx: Ctx,
  args: {
    agent_id: string;
    procedure_id?: string | null;
    record_id: string;
    source_ids: string[];
    instructions: string;
    space_id?: string | null;
    draft?: boolean;
  },
) {
  const agent = await getOr404<Agent>(ctx, "agents", args.agent_id, "This agent");
  assert(agent.published_revision_id, new OpError(`${agent.name} has no published revision available.`));
  let procedureRevisionId: string | null = null;
  if (args.procedure_id) {
    const proc = await getOr404<Procedure>(ctx, "procedures", args.procedure_id, "This procedure");
    assert(proc.published_revision_id, new OpError(`${proc.name} has no published revision available.`));
    procedureRevisionId = proc.published_revision_id;
  }
  const { data: record } = await ctx.db.from("sandbox_records").select("*").eq("id", args.record_id).maybeSingle();
  assert(record, new OpError("Choose a record from a connection you can read."));
  const rec = record as SandboxRecord;
  assert(args.source_ids.length > 0, new OpError("Select the plan and inventory sources this assessment relies on."));

  const title = `Delivery assessment — ${rec.external_id} (${rec.data.item})`;
  const { data: output, error: oe } = await ctx.db
    .from("outputs")
    .insert({ org_id: ctx.me.org_id, title, owner_id: ctx.me.user_id, space_id: args.space_id ?? null })
    .select()
    .single();
  if (oe) throw new OpError(oe.message);
  await ctx.db.from("output_versions").insert({
    output_id: output.id,
    version: 1,
    content: "_The assessment will appear here once the agent has read the selected records._",
    author_kind: "person",
    author_id: ctx.me.user_id,
    note: "Placeholder created with the assignment",
  });

  const { data: a, error } = await ctx.db
    .from("assignments")
    .insert({
      org_id: ctx.me.org_id,
      agent_id: agent.id,
      agent_revision_id: agent.published_revision_id,
      procedure_revision_id: procedureRevisionId,
      kind: "ongoing",
      purpose: `Keep the ${rec.data.item} assessment current as ${rec.external_id} changes`,
      instructions: args.instructions.trim(),
      status: args.draft ? "Draft" : "Active",
      condition: args.draft ? "Draft — not started" : "Preparing the first assessment",
      responsible_id: ctx.me.user_id,
      created_by: ctx.me.user_id,
      space_id: args.space_id ?? null,
      output_id: output.id,
      connection_id: rec.connection_id,
      watch_record_id: rec.id,
      scope: { item: rec.data.item, allowed_operations: ["set_risk_flag"] },
    })
    .select()
    .single();
  if (error) throw new OpError(error.message);
  await ctx.db
    .from("assignment_sources")
    .insert(args.source_ids.map((source_id) => ({ assignment_id: a.id, source_id })));

  await log(ctx, {
    verb: args.draft ? "drafted" : "activated",
    summary: `${args.draft ? "Saved a draft" : "Started"} ongoing assignment: ${a.purpose}`,
    subject_kind: "assignment",
    subject_id: a.id,
    assignment_id: a.id,
  });
  if (!args.draft) await queueRun(ctx, a.id, "start", "Prepare the initial assessment");
  return { assignment_id: a.id as string, output_id: output.id as string };
}

export async function activateDraft(ctx: Ctx, args: { assignment_id: string }) {
  const a = await getOr404<Assignment>(ctx, "assignments", args.assignment_id, "This assignment");
  await requireIntervention(ctx, a);
  assert(a.status === "Draft", conflict("Only a draft can be activated."));
  await ctx.db.from("assignments").update({ status: "Active", condition: "Preparing the first assessment", updated_at: now() }).eq("id", a.id);
  await log(ctx, { verb: "activated", summary: "Activated the assignment", subject_kind: "assignment", subject_id: a.id, assignment_id: a.id });
  await queueRun(ctx, a.id, "start", "Prepare the initial assessment");
  return { ok: true };
}

export async function queueRun(ctx: Ctx, assignmentId: string, trigger: string, instruction = "", inputs: Record<string, unknown> = {}) {
  const { data: org } = await ctx.db.from("assignments").select("org_id").eq("id", assignmentId).single();
  const { error } = await ctx.db.from("runs").insert({
    org_id: org?.org_id ?? ctx.me.org_id,
    assignment_id: assignmentId,
    trigger,
    instruction,
    inputs,
    created_by: ctx.system ? null : ctx.me.user_id,
  });
  if (error) throw new Error(`queue run: ${error.message}`);
  kick();
}

/**
 * Who may intervene: the responsible person, whoever started it, or a supervisor.
 * Supervision is not business approval.
 */
async function requireIntervention(ctx: Ctx, a: Assignment) {
  if (ctx.system) return;
  if (a.responsible_id === ctx.me.user_id || a.created_by === ctx.me.user_id || ctx.me.is_supervisor) return;
  throw denied("Only the responsible person or a supervisor can change this assignment.");
}

export async function pauseAssignment(ctx: Ctx, args: { assignment_id: string }) {
  const a = await getOr404<Assignment>(ctx, "assignments", args.assignment_id, "This assignment");
  await requireIntervention(ctx, a);
  const upd = await ctx.db
    .from("assignments")
    .update({ status: "Pausing", condition: "Pause requested — stopping at the next boundary", updated_at: now() })
    .eq("id", a.id)
    .eq("status", "Active")
    .select("id");
  assert(upd.data?.length, conflict(`This assignment is ${a.status.toLowerCase()}, so it can't be paused.`));
  await log(ctx, {
    verb: "pause_requested",
    summary: "Requested pause. Earlier actions are not undone.",
    subject_kind: "assignment",
    subject_id: a.id,
    assignment_id: a.id,
    mission_id: a.mission_id,
  });
  kick();
  return { ok: true };
}

export async function resumeAssignment(ctx: Ctx, args: { assignment_id: string }) {
  const a = await getOr404<Assignment>(ctx, "assignments", args.assignment_id, "This assignment");
  await requireIntervention(ctx, a);
  assert(a.status === "Paused", conflict(`This assignment is ${a.status.toLowerCase()}, so it can't be resumed.`));

  // Resuming reassesses the current situation. Approvals given for earlier
  // proposals that haven't been carried out are not replayed.
  const { data: stale } = await ctx.db
    .from("action_attempts")
    .select("*")
    .eq("assignment_id", a.id)
    .eq("status", "AwaitingAuthorization");
  for (const s of stale ?? []) {
    await ctx.db
      .from("action_attempts")
      .update({ status: "Superseded", updated_at: now(), reason: `${s.reason} — superseded on resume; reassessed from current state` })
      .eq("id", s.id);
    if (s.request_id) {
      await ctx.db.from("requests").update({ status: "Superseded", updated_at: now() }).eq("id", s.request_id).eq("status", "Open");
    }
  }

  await ctx.db.from("assignments").update({ status: "Active", condition: "Resumed — reassessing current state", updated_at: now() }).eq("id", a.id);
  await log(ctx, {
    verb: "resumed",
    summary: `Resumed. Reassessing from current records${stale?.length ? `; ${stale.length} earlier proposal(s) superseded rather than replayed` : ""}.`,
    subject_kind: "assignment",
    subject_id: a.id,
    assignment_id: a.id,
    mission_id: a.mission_id,
  });
  if (a.kind === "ongoing") await queueRun(ctx, a.id, "resume", "Reassess after resuming");
  else if (a.task_id) {
    const { reevaluateTask } = await import("./tasks");
    await reevaluateTask(ctx, a.task_id);
  }
  return { ok: true };
}

export async function endAssignment(ctx: Ctx, args: { assignment_id: string }) {
  const a = await getOr404<Assignment>(ctx, "assignments", args.assignment_id, "This assignment");
  await requireIntervention(ctx, a);
  const upd = await ctx.db
    .from("assignments")
    .update({ status: "Ending", condition: "End requested — stopping at the next boundary", updated_at: now() })
    .eq("id", a.id)
    .in("status", ["Draft", "Active", "Pausing", "Paused"])
    .select("id");
  assert(upd.data?.length, conflict(`This assignment is already ${a.status.toLowerCase()}.`));
  await log(ctx, {
    verb: "end_requested",
    summary: "Requested end. Earlier actions and uncertain effects remain visible.",
    subject_kind: "assignment",
    subject_id: a.id,
    assignment_id: a.id,
    mission_id: a.mission_id,
  });
  kick();
  return { ok: true };
}

/** Applies to this assignment only — never to the reusable definition. */
export async function changeInstructions(ctx: Ctx, args: { assignment_id: string; instructions: string }) {
  const a = await getOr404<Assignment>(ctx, "assignments", args.assignment_id, "This assignment");
  await requireIntervention(ctx, a);
  assert(!["Ending", "Ended"].includes(a.status), conflict("This assignment has ended."));
  const { data: running } = await ctx.db.from("runs").select("id").eq("assignment_id", a.id).eq("status", "Running");
  if (running?.length) {
    await ctx.db
      .from("assignments")
      .update({
        scope: { ...a.scope, pending_instructions: args.instructions.trim() },
        condition: "Instruction change pending — applies when the current run finishes",
        updated_at: now(),
      })
      .eq("id", a.id);
    await log(ctx, {
      verb: "instructions_pending",
      summary: "Changed instructions for this assignment (pending until the current run finishes)",
      subject_kind: "assignment",
      subject_id: a.id,
      assignment_id: a.id,
      mission_id: a.mission_id,
    });
    kick();
    return { status: "pending" };
  }
  await ctx.db.from("assignments").update({ instructions: args.instructions.trim(), updated_at: now() }).eq("id", a.id);
  await log(ctx, {
    verb: "instructions_changed",
    summary: `Changed instructions for this assignment only: ${truncate(args.instructions, 120)}`,
    subject_kind: "assignment",
    subject_id: a.id,
    assignment_id: a.id,
    mission_id: a.mission_id,
  });
  return { status: "effective" };
}

/** Adopt a different saved agent revision. Pending until no run is executing. */
export async function applyRevision(ctx: Ctx, args: { assignment_id: string; agent_revision_id: string }) {
  const a = await getOr404<Assignment>(ctx, "assignments", args.assignment_id, "This assignment");
  await requireIntervention(ctx, a);
  const rev = await getOr404<AgentRevision>(ctx, "agent_revisions", args.agent_revision_id, "This revision");
  assert(rev.agent_id === a.agent_id, new OpError("That revision belongs to a different agent."));
  assert(rev.id !== a.agent_revision_id, new OpError("The assignment already uses that revision."));
  await ctx.db
    .from("assignments")
    .update({ pending_agent_revision_id: rev.id, updated_at: now() })
    .eq("id", a.id);
  await log(ctx, {
    verb: "adoption_requested",
    summary: `Requested adoption of revision ${rev.revision}. Pending until no run is executing.`,
    subject_kind: "assignment",
    subject_id: a.id,
    assignment_id: a.id,
    mission_id: a.mission_id,
  });
  kick();
  return { ok: true };
}

/** Readback of an uncertain action. It never repeats the write. */
export async function checkActionResult(ctx: Ctx, args: { attempt_id: string }) {
  const { readback } = await import("./sandbox");
  return readback(ctx, args.attempt_id);
}

export async function notifyResponsible(ctx: Ctx, a: Assignment, title: string, body: string, link?: string) {
  await notify(ctx, a.responsible_id, { kind: "assignment", title, body, link: link ?? `/assignments/${a.id}` });
}
