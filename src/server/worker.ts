import "server-only";
import { systemCtx, type Ctx } from "./context";
import { registerKick } from "./kick";
import { assessDelivery, contribute, converse, revise, type ConverseOutput, type DeliveryFacts, type SourceInput } from "./agent/contributions";
import { describeError } from "./agent/runtime";
import { log, nameOf, notify, now, truncate } from "./domain/common";
import { onTaskDone } from "./domain/tasks";
import { advanceCase } from "./domain/case-engine";
import { dispatchAttempt, effectiveRule } from "./domain/sandbox";
import type {
  ActionAttempt,
  AgentRevision,
  Assignment,
  Connection,
  Conversation,
  Output,
  ProcedureRevision,
  Run,
  SandboxRecord,
  Source,
  SourceEvent,
  SourceRef,
  Task,
} from "./types";

/*
 * The worker carries delegated activity forward on the server, independent of
 * any open page. It runs as the Loura system identity. Pause and End take effect
 * at declared boundaries: before a run starts, and before a run's result is
 * applied. Until then the assignment shows Pausing / Ending.
 */

class StopAtBoundary extends Error {
  constructor(public assignmentStatus: string) {
    super(`Assignment is ${assignmentStatus}`);
  }
}

const g = globalThis as unknown as { __louraWorker?: { running: boolean; again: boolean; timer?: NodeJS.Timeout } };
g.__louraWorker ??= { running: false, again: false };
const state = g.__louraWorker;

export function startWorker() {
  if (state.timer) return;
  state.timer = setInterval(() => void tick(), 2500);
  console.log("[loura] worker started");
}

registerKick(() => {
  setTimeout(() => void tick(), 50);
});

export async function tick() {
  if (state.running) {
    state.again = true;
    return;
  }
  state.running = true;
  try {
    do {
      state.again = false;
      const sys = await systemCtx();
      await applyLifecycle(sys);
      await dispatchApproved(sys);
      await processQueuedRuns(sys);
    } while (state.again);
  } catch (e) {
    console.error("[loura] worker tick failed:", e);
  } finally {
    state.running = false;
  }
}

// ---------------------------------------------------------------------------
// Lifecycle boundaries
// ---------------------------------------------------------------------------

async function applyLifecycle(sys: Ctx) {
  const { data } = await sys.db
    .from("assignments")
    .select("*")
    .or("status.in.(Pausing,Ending),pending_agent_revision_id.not.is.null,scope->>pending_instructions.not.is.null");
  for (const a of (data ?? []) as Assignment[]) {
    const { data: running } = await sys.db.from("runs").select("id").eq("assignment_id", a.id).eq("status", "Running");
    if (running?.length) continue; // not yet at a boundary

    if (a.pending_agent_revision_id) {
      const { data: rev } = await sys.db.from("agent_revisions").select("revision").eq("id", a.pending_agent_revision_id).single();
      await sys.db
        .from("assignments")
        .update({ agent_revision_id: a.pending_agent_revision_id, pending_agent_revision_id: null, updated_at: now() })
        .eq("id", a.id);
      await log(sys, {
        verb: "adopted_revision",
        summary: `Revision ${rev?.revision} is now effective for this assignment. Earlier runs keep the revision they used.`,
        subject_kind: "assignment",
        subject_id: a.id,
        assignment_id: a.id,
        mission_id: a.mission_id,
      });
    }
    const pending = (a.scope as { pending_instructions?: string }).pending_instructions;
    if (pending !== undefined) {
      const { pending_instructions: _drop, ...rest } = a.scope as Record<string, unknown>;
      void _drop;
      await sys.db
        .from("assignments")
        .update({ instructions: pending, scope: rest, condition: "", updated_at: now() })
        .eq("id", a.id);
      await log(sys, {
        verb: "instructions_changed",
        summary: `Instruction change is now effective: ${truncate(pending, 120)}`,
        subject_kind: "assignment",
        subject_id: a.id,
        assignment_id: a.id,
        mission_id: a.mission_id,
      });
    }

    if (a.status === "Pausing" || a.status === "Ending") {
      const { data: stopped } = await sys.db
        .from("runs")
        .update({ status: "Stopped", finished_at: now(), summary: `Not started: ${a.status === "Pausing" ? "paused" : "ended"} before it ran` })
        .eq("assignment_id", a.id)
        .in("status", ["Queued", "Waiting"])
        .select("id");
      if (a.status === "Pausing") {
        const conn = a.connection_id
          ? ((await sys.db.from("connections").select("*").eq("id", a.connection_id).single()).data as Connection)
          : null;
        const condition = conn
          ? conn.events_available
            ? "Actions paused · Still receiving updates"
            : "Paused · Observation unavailable"
          : "Paused · No new work will start";
        await sys.db.from("assignments").update({ status: "Paused", condition, updated_at: now() }).eq("id", a.id).eq("status", "Pausing");
        await log(sys, {
          verb: "paused",
          summary: `Pause is effective.${stopped?.length ? ` ${stopped.length} queued run(s) stopped.` : ""} No new actions will be dispatched.`,
          subject_kind: "assignment",
          subject_id: a.id,
          assignment_id: a.id,
          mission_id: a.mission_id,
        });
      } else {
        // Undecided proposals from this assignment no longer need a decision.
        const { data: open } = await sys.db
          .from("action_attempts")
          .select("*")
          .eq("assignment_id", a.id)
          .eq("status", "AwaitingAuthorization");
        for (const at of (open ?? []) as ActionAttempt[]) {
          await sys.db.from("action_attempts").update({ status: "Superseded", updated_at: now() }).eq("id", at.id);
          if (at.request_id) {
            await sys.db.from("requests").update({ status: "Withdrawn", updated_at: now() }).eq("id", at.request_id).eq("status", "Open");
          }
        }
        await sys.db
          .from("assignments")
          .update({ status: "Ended", ended_at: now(), updated_at: now() })
          .eq("id", a.id)
          .eq("status", "Ending");
        await log(sys, {
          verb: "ended",
          summary: `Ended${a.condition ? ` (${a.condition})` : ""}. Earlier actions and any uncertain effects remain visible.`,
          subject_kind: "assignment",
          subject_id: a.id,
          assignment_id: a.id,
          mission_id: a.mission_id,
        });
      }
    }
  }
}

async function dispatchApproved(sys: Ctx) {
  const { data } = await sys.db
    .from("action_attempts")
    .select("*")
    .eq("status", "AwaitingAuthorization")
    .not("decided_at", "is", null)
    .is("claimed_at", null);
  for (const at of (data ?? []) as ActionAttempt[]) {
    try {
      await dispatchAttempt(sys, at);
    } catch (e) {
      console.error("[loura] dispatch failed:", e);
    }
  }
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

async function processQueuedRuns(sys: Ctx) {
  const { data } = await sys.db.from("runs").select("*").eq("status", "Queued").order("created_at").limit(6);
  const byAssignment = new Map<string, Run>();
  for (const r of (data ?? []) as Run[]) if (!byAssignment.has(r.assignment_id)) byAssignment.set(r.assignment_id, r);

  await Promise.all(
    [...byAssignment.values()].map(async (run) => {
      const { data: busy } = await sys.db.from("runs").select("id").eq("assignment_id", run.assignment_id).eq("status", "Running");
      if (busy?.length) return;
      const claim = await sys.db
        .from("runs")
        .update({ status: "Running", started_at: now() })
        .eq("id", run.id)
        .eq("status", "Queued")
        .select("*");
      if (!claim.data?.length) return;
      await processRun(sys, claim.data[0] as Run);
      state.again = true;
    }),
  );
}

async function loadAssignment(sys: Ctx, id: string) {
  const { data } = await sys.db.from("assignments").select("*").eq("id", id).single();
  return data as Assignment;
}

/** The declared stop boundary: nothing is applied if the assignment is no longer Active. */
async function boundary(sys: Ctx, assignmentId: string) {
  const { data } = await sys.db.from("assignments").select("status").eq("id", assignmentId).single();
  if (data?.status !== "Active") throw new StopAtBoundary(data?.status ?? "missing");
}

async function processRun(sys: Ctx, run: Run) {
  const a = await loadAssignment(sys, run.assignment_id);
  if (a.status !== "Active") {
    await sys.db
      .from("runs")
      .update({ status: "Stopped", finished_at: now(), summary: `Not started: the assignment is ${a.status.toLowerCase()}` })
      .eq("id", run.id);
    return;
  }
  const { data: rev } = await sys.db.from("agent_revisions").select("*").eq("id", a.agent_revision_id).single();
  const revision = rev as AgentRevision;

  try {
    let outcome: { summary: string; result?: Record<string, unknown>; meta?: Partial<Run> };
    switch (run.trigger) {
      case "conversation":
        outcome = await runConversation(sys, run, a, revision);
        break;
      case "contribution":
        outcome = await runContribution(sys, run, a, revision);
        break;
      case "revise":
        outcome = await runRevise(sys, run, a, revision);
        break;
      case "case":
        outcome = await runCase(sys, run, a);
        break;
      default:
        outcome = await runMonitoring(sys, run, a, revision);
    }
    await sys.db
      .from("runs")
      .update({
        status: "Succeeded",
        finished_at: now(),
        summary: outcome.summary,
        result: outcome.result ?? {},
        ...(outcome.meta ?? {}),
      })
      .eq("id", run.id);
  } catch (e) {
    if (e instanceof StopAtBoundary) {
      await sys.db
        .from("runs")
        .update({
          status: "Stopped",
          finished_at: now(),
          summary: `Stopped at the boundary: the assignment became ${e.assignmentStatus.toLowerCase()} while this run was working. Its result was not applied.`,
        })
        .eq("id", run.id);
      await log(sys, {
        verb: "run_stopped",
        summary: "A run reached its stop boundary. Its result was held, not applied.",
        subject_kind: "assignment",
        subject_id: a.id,
        assignment_id: a.id,
        run_id: run.id,
        mission_id: a.mission_id,
      });
      return;
    }
    const message = describeError(e);
    console.error("[loura] run failed:", e);
    await sys.db.from("runs").update({ status: "Failed", finished_at: now(), error: message, summary: "Run failed" }).eq("id", run.id);
    await sys.db.from("assignments").update({ condition: `Last run failed: ${truncate(message, 160)}`, updated_at: now() }).eq("id", a.id);
    if (a.conversation_id && run.trigger === "conversation") {
      await sys.db.from("messages").insert({
        conversation_id: a.conversation_id,
        author_kind: "system",
        body: `The agent couldn't respond: ${message} Your message is saved; you can try again.`,
        run_id: run.id,
      });
    }
    await notify(sys, a.responsible_id, {
      kind: "run_failed",
      title: "An agent contribution failed",
      body: `${a.purpose}: ${truncate(message, 140)}`,
      link: `/assignments/${a.id}`,
    });
    await log(sys, {
      verb: "run_failed",
      summary: `Run failed: ${truncate(message, 160)}`,
      subject_kind: "assignment",
      subject_id: a.id,
      assignment_id: a.id,
      run_id: run.id,
      mission_id: a.mission_id,
    });
  }
}

async function sourcesFor(sys: Ctx, ids: string[]): Promise<SourceInput[]> {
  if (!ids.length) return [];
  const { data } = await sys.db.from("sources").select("*").in("id", ids);
  return ((data ?? []) as Source[]).map((s) => ({
    id: s.id,
    title: s.title,
    version: s.version,
    kind: s.kind,
    content: s.content,
    data: s.data,
    observed_at: s.observed_at,
  }));
}

const refs = (sources: SourceInput[]): SourceRef[] =>
  sources.map((s) => ({ source_id: s.id, title: s.title, version: s.version, observed_at: s.observed_at, kind: s.kind }));

function runMeta(r: { simulated: boolean; model: string | null; tool_calls: unknown; usage: unknown }, inputs: Record<string, unknown>) {
  return { simulated: r.simulated, model: r.model, tool_calls: r.tool_calls, usage: r.usage, inputs } as Partial<Run>;
}

// Journey A -------------------------------------------------------------------

const SMALL_TALK =
  /^(hi|hii+|hello|hey|hiya|yo|salam|salaam|assalamu alaikum|marhaba|ahlan|good (morning|afternoon|evening)|thanks|thank you|thx|ty|ok|okay|cool|great|nice|bye|goodbye)\b[\s!.,?🙂😊👋]*(there|loura|agent)?[\s!.,?🙂😊👋]*$/i;
const isSmallTalk = (text: string) => SMALL_TALK.test(text.trim());

async function runConversation(sys: Ctx, run: Run, a: Assignment, rev: AgentRevision) {
  const conv = (await sys.db.from("conversations").select("*").eq("id", a.conversation_id).single()).data as Conversation;
  const { data: msgs } = await sys.db
    .from("messages")
    .select("*")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: true })
    .limit(30);
  const { data: selected } = await sys.db.from("conversation_sources").select("source_id").eq("conversation_id", conv.id);
  const sources = await sourcesFor(sys, (selected ?? []).map((s) => s.source_id));
  const history = await Promise.all(
    (msgs ?? []).slice(0, -1).map(async (m) => ({
      author: m.author_kind === "person" ? await nameOf(sys, m.author_id) : m.author_kind === "agent" ? "Agent" : "System",
      body: m.body,
    })),
  );

  const existingTask = a.task_id ? ((await sys.db.from("tasks").select("title").eq("id", a.task_id).maybeSingle()).data?.title as string | undefined) : null;
  const r = await converse({ instructions: rev.instructions, question: run.instruction, history, sources, existing_task: existingTask });
  // Greetings and thanks never become tasks, whatever the model decided.
  if (isSmallTalk(run.instruction)) {
    r.output.create_task = false;
    r.output.create_document = false;
  }
  // Work never starts without approval: a document produced here, outside a task, becomes a task proposal instead.
  if (!a.task_id && r.output.create_document && !r.output.create_task) {
    r.output.create_task = true;
    r.output.task_title ||= r.output.document_title || truncate(run.instruction, 80);
    r.output.task_expected_result ||= `A document: ${r.output.document_title || truncate(run.instruction, 120)}.`;
    r.output.create_document = false;
    r.output.reply = `${r.output.reply}\n\nI've proposed this as a task — it starts once you approve it in your Inbox.`;
  }
  await boundary(sys, a.id);

  let outputId: string | null = null;
  if (r.output.create_document && r.output.document_markdown.trim()) {
    const { data: output } = await sys.db
      .from("outputs")
      .insert({
        org_id: a.org_id,
        title: r.output.document_title || "Agent document",
        owner_id: conv.owner_id,
        private: false,
        current_version: 1,
      })
      .select()
      .single();
    outputId = output.id;
    await sys.db.from("output_versions").insert({
      output_id: output.id,
      version: 1,
      content: r.output.document_markdown,
      author_kind: "agent",
      agent_id: a.agent_id,
      run_id: run.id,
      sources: refs(sources),
      note: r.simulated ? "Created by a simulated agent run" : "Created by the agent",
    });
    await sys.db.from("assignments").update({ output_id: output.id }).eq("id", a.id);
    await log(sys, {
      verb: "created",
      summary: `Created “${output.title}” from the conversation`,
      subject_kind: "output",
      subject_id: output.id,
      agent_id: a.agent_id,
      assignment_id: a.id,
      run_id: run.id,
    });
  }
  const taskId = await proposeTaskFromConversation(sys, run, a, r.output);
  await sys.db.from("messages").insert({
    conversation_id: conv.id,
    author_kind: "agent",
    agent_id: a.agent_id,
    body: r.output.reply,
    output_id: outputId,
    run_id: run.id,
    simulated: r.simulated,
  });
  await sys.db.from("conversations").update({ updated_at: now() }).eq("id", conv.id);
  await sys.db.from("assignments").update({ condition: "Idle — responds when you send a message", updated_at: now() }).eq("id", a.id);
  return {
    summary: truncate(r.output.reply, 200),
    result: { unknowns: r.output.unknowns, output_id: outputId, task_id: taskId },
    meta: runMeta(r, { question: run.instruction, sources: refs(sources), agent_revision_id: rev.id }),
  };
}

/**
 * Tasks aren't created by people: the agent proposes one when a conversation asks for
 * work to be done. The proposal is an approval request — nothing starts until the
 * person approves it. One task per conversation.
 */
async function proposeTaskFromConversation(sys: Ctx, run: Run, a: Assignment, out: ConverseOutput) {
  if (a.task_id) return a.task_id;
  if (!out.create_task || !out.task_title.trim()) return null;
  const { data: task, error } = await sys.db
    .from("tasks")
    .insert({
      org_id: a.org_id,
      title: truncate(out.task_title.trim(), 120),
      expected_result: out.task_expected_result.trim(),
      status: "Open",
      performer_kind: "agent",
      agent_id: a.agent_id,
      responsible_id: a.responsible_id,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  await sys.db.from("assignments").update({ task_id: task.id }).eq("id", a.id);
  const { error: reqError } = await sys.db.from("requests").insert({
    org_id: a.org_id,
    type: "authorization",
    recipient_id: a.responsible_id,
    requester_kind: "agent",
    agent_id: a.agent_id,
    assignment_id: a.id,
    task_id: task.id,
    question: `Start the task “${task.title}”?`,
    reason: task.expected_result || "Proposed from your conversation.",
    context_excerpt: truncate(run.instruction, 400),
  });
  if (reqError) throw new Error(reqError.message);
  await log(sys, {
    verb: "proposed",
    summary: `Proposed the task “${task.title}” from the conversation. Waiting for ${await nameOf(sys, a.responsible_id)} to approve.`,
    subject_kind: "task",
    subject_id: task.id,
    agent_id: a.agent_id,
    assignment_id: a.id,
    run_id: run.id,
  });
  return task.id as string;
}

async function runRevise(sys: Ctx, run: Run, a: Assignment, rev: AgentRevision) {
  const outputId = String(run.inputs.output_id);
  const base = Number(run.inputs.base_version);
  const output = (await sys.db.from("outputs").select("*").eq("id", outputId).single()).data as Output;
  const { data: baseVersion } = await sys.db
    .from("output_versions")
    .select("*")
    .eq("output_id", outputId)
    .eq("version", base)
    .single();
  const sources = await sourcesFor(sys, (baseVersion.sources ?? []).map((s: SourceRef) => s.source_id));

  const r = await revise({
    instructions: rev.instructions,
    title: output.title,
    content: baseVersion.content,
    instruction: run.instruction,
    sources,
  });
  await boundary(sys, a.id);

  // Compare-and-set against the version the agent started from.
  const bump = await sys.db
    .from("outputs")
    .update({ current_version: base + 1, updated_at: now() })
    .eq("id", outputId)
    .eq("current_version", base)
    .select("id");

  const meta = runMeta(r, { output_id: outputId, base_version: base, instruction: run.instruction, agent_revision_id: rev.id });
  if (bump.data?.length) {
    await sys.db.from("output_versions").insert({
      output_id: outputId,
      version: base + 1,
      content: r.output.revised_markdown,
      author_kind: "agent",
      agent_id: a.agent_id,
      run_id: run.id,
      based_on: base,
      sources: baseVersion.sources,
      note: `Agent revision: ${truncate(run.instruction, 120)}`,
    });
    await log(sys, {
      verb: "revised",
      summary: `Agent saved version ${base + 1} of “${output.title}”`,
      subject_kind: "output",
      subject_id: outputId,
      agent_id: a.agent_id,
      assignment_id: a.id,
      run_id: run.id,
      mission_id: output.mission_id,
    });
    await notify(sys, a.responsible_id, {
      kind: "agent_revision",
      title: `The agent revised “${output.title}”`,
      body: `Version ${base + 1} is saved.`,
      link: `/outputs/${outputId}`,
    });
    if (a.conversation_id) {
      await sys.db.from("messages").insert({
        conversation_id: a.conversation_id,
        author_kind: "agent",
        agent_id: a.agent_id,
        body: `${r.output.summary} (saved as version ${base + 1})`,
        output_id: outputId,
        run_id: run.id,
        simulated: r.simulated,
      });
    }
    return { summary: `Saved version ${base + 1}: ${truncate(r.output.summary, 160)}`, meta };
  }

  // Someone saved a newer version meanwhile: keep both for an explicit choice.
  const { data: latest } = await sys.db.from("outputs").select("current_version").eq("id", outputId).single();
  await sys.db.from("output_proposals").insert({
    output_id: outputId,
    based_on: base,
    content: r.output.revised_markdown,
    instruction: run.instruction,
    run_id: run.id,
    agent_id: a.agent_id,
  });
  await log(sys, {
    verb: "proposed_revision",
    summary: `Agent revision based on version ${base} was kept as a proposal: version ${latest?.current_version} was saved meanwhile.`,
    subject_kind: "output",
    subject_id: outputId,
    agent_id: a.agent_id,
    assignment_id: a.id,
    run_id: run.id,
    mission_id: output.mission_id,
  });
  await notify(sys, a.responsible_id, {
    kind: "agent_revision_conflict",
    title: `The agent's revision of “${output.title}” needs your choice`,
    body: `It was based on version ${base}, but version ${latest?.current_version} was saved meanwhile. Nothing was overwritten.`,
    link: `/outputs/${outputId}`,
  });
  return { summary: `Kept as a proposal — the document changed during the run`, meta };
}

// Journey B -------------------------------------------------------------------

async function runContribution(sys: Ctx, run: Run, a: Assignment, rev: AgentRevision) {
  const task = (await sys.db.from("tasks").select("*").eq("id", a.task_id).single()).data as Task;

  // Current context at run start; the run records exactly what it used.
  const ids = new Set<string>();
  const { data: aSources } = await sys.db.from("assignment_sources").select("source_id").eq("assignment_id", a.id);
  for (const s of aSources ?? []) ids.add(s.source_id);
  const sources = await sourcesFor(sys, [...ids]);

  const { data: deps } = await sys.db.from("task_dependencies").select("depends_on_id").eq("task_id", task.id);
  const contributions: { title: string; by: string; content: string }[] = [];
  for (const d of deps ?? []) {
    const dep = (await sys.db.from("tasks").select("*").eq("id", d.depends_on_id).single()).data as Task;
    let content = dep.result_note || "";
    if (dep.output_id) {
      const o = (await sys.db.from("outputs").select("*").eq("id", dep.output_id).single()).data as Output;
      const { data: v } = await sys.db
        .from("output_versions")
        .select("content")
        .eq("output_id", o.id)
        .eq("version", o.current_version)
        .single();
      content = `${content}\n\n${v?.content ?? ""}`.trim();
    }
    const by = dep.performer_kind === "agent" ? "an agent" : await nameOf(sys, dep.performer_id);
    contributions.push({ title: dep.title, by, content: content || "(completed without a written result)" });
  }
  const answers: { question: string; answer: string; by: string }[] = [];
  const { data: reqs } = await sys.db
    .from("requests")
    .select("*")
    .eq("task_id", task.id)
    .eq("type", "information")
    .eq("status", "Resolved");
  for (const q of reqs ?? []) {
    if (q.response_kind === "answer") answers.push({ question: q.question, answer: q.response_text ?? "", by: await nameOf(sys, q.responded_by) });
    if (q.response_kind === "dont_know") answers.push({ question: q.question, answer: "(the colleague didn't know — still unconfirmed)", by: await nameOf(sys, q.responded_by) });
  }

  // Who the agent may ask, and what it has asked already (so it never repeats a question).
  const { data: colleagueRows } = await sys.db
    .from("members")
    .select("user_id,full_name,title,status,is_system")
    .eq("status", "active");
  const colleagues = (colleagueRows ?? []).filter((m) => !m.is_system && m.user_id !== a.responsible_id);
  const { data: askedRows } = await sys.db.from("requests").select("question").eq("task_id", task.id).eq("type", "information");

  const r = await contribute({
    instructions: rev.instructions,
    task: { title: task.title, expected_result: task.expected_result, instruction: a.instructions },
    sources,
    contributions,
    answers,
    colleagues: colleagues.map((m) => ({ name: m.full_name, title: m.title })),
    asked: (askedRows ?? []).map((x) => x.question as string),
  });
  await boundary(sys, a.id);

  const inputs = {
    task_id: task.id,
    sources: refs(sources),
    contributions: contributions.map((c) => c.title),
    answers: answers.map((x) => x.question),
    agent_revision_id: rev.id,
  };

  let outputId = task.output_id;
  let version = 1;
  if (outputId) {
    const o = (await sys.db.from("outputs").select("*").eq("id", outputId).single()).data as Output;
    version = o.current_version + 1;
    await sys.db.from("outputs").update({ current_version: version, updated_at: now() }).eq("id", o.id).eq("current_version", o.current_version);
  } else {
    const { data: o } = await sys.db
      .from("outputs")
      .insert({
        org_id: a.org_id,
        title: r.output.document_title || task.title,
        owner_id: a.responsible_id,
        mission_id: task.mission_id,
        space_id: task.space_id,
        private: false,
      })
      .select()
      .single();
    outputId = o.id;
  }
  await sys.db.from("output_versions").insert({
    output_id: outputId,
    version,
    content: r.output.document_markdown,
    author_kind: "agent",
    agent_id: a.agent_id,
    run_id: run.id,
    sources: refs(sources),
    note: `Contribution for “${task.title}”${r.simulated ? " (simulated agent)" : ""}`,
  });
  await sys.db.from("tasks").update({ output_id: outputId, updated_at: now() }).eq("id", task.id);
  await sys.db.from("assignments").update({ output_id: outputId }).eq("id", a.id);
  await log(sys, {
    verb: "contributed",
    summary: `${r.output.summary ? truncate(r.output.summary, 160) : "Delivered a contribution"} — “${task.title}”`,
    subject_kind: "task",
    subject_id: task.id,
    mission_id: task.mission_id,
    agent_id: a.agent_id,
    assignment_id: a.id,
    run_id: run.id,
  });

  // The agent may ask exactly one colleague. The question holds the task until it's answered.
  const askName = r.output.ask_colleague?.trim();
  const question = r.output.question?.trim();
  if (askName && question) {
    const recipient = colleagues.find((m) => m.full_name.toLowerCase() === askName.toLowerCase());
    const alreadyOpen = ((askedRows ?? []).length && (await sys.db.from("requests").select("id").eq("task_id", task.id).eq("status", "Open").limit(1)).data?.length) || 0;
    if (recipient && !alreadyOpen) {
      const { data: req } = await sys.db
        .from("requests")
        .insert({
          org_id: a.org_id, type: "information", recipient_id: recipient.user_id,
          requester_kind: "agent", agent_id: a.agent_id, assignment_id: a.id, task_id: task.id,
          question,
          reason: r.output.question_reason?.trim() || "The result depends on this fact.",
          context_excerpt: truncate(r.output.summary ?? "", 400),
        })
        .select("id")
        .single();
      await log(sys, {
        verb: "asked",
        summary: `Asked ${recipient.full_name}: ${truncate(question, 120)}`,
        subject_kind: "task", subject_id: task.id, agent_id: a.agent_id, assignment_id: a.id, run_id: run.id,
      });
      await notify(sys, recipient.user_id, {
        kind: "request",
        title: `${await nameOf(sys, a.responsible_id)}'s agent needs an answer`,
        body: truncate(question, 140),
        link: `/inbox?request=${req?.id ?? ""}`,
      });
      await sys.db
        .from("assignments")
        .update({ condition: `Waiting for ${recipient.full_name} to answer: ${truncate(question, 80)}`, updated_at: now() })
        .eq("id", a.id);
      await sys.db.from("tasks").update({ status: "InProgress", updated_at: now() }).eq("id", task.id);
      return {
        summary: truncate(r.output.summary || "Draft delivered; waiting on an answer", 200),
        result: { output_id: outputId, missing: r.output.missing_information, asked: question },
        meta: runMeta(r, inputs),
      };
    }
  }

  if (task.requires_review) {
    await sys.db.from("tasks").update({ status: "InProgress", updated_at: now() }).eq("id", task.id);
    await sys.db
      .from("assignments")
      .update({ condition: `Delivered version ${version} — waiting for a person to request review or ask for changes`, updated_at: now() })
      .eq("id", a.id);
    await notify(sys, a.responsible_id, {
      kind: "contribution",
      title: `Draft ready: “${task.title}”`,
      body: "Review it, edit it, or request review when it's ready.",
      link: `/outputs/${outputId}`,
    });
  } else {
    await sys.db.from("tasks").update({ status: "Done", completed_at: now(), updated_at: now() }).eq("id", task.id);
    await sys.db.from("assignments").update({ status: "Ended", ended_at: now(), condition: "Contribution delivered", updated_at: now() }).eq("id", a.id);
    await log(sys, {
      verb: "completed",
      summary: `“${task.title}” is done`,
      subject_kind: "task",
      subject_id: task.id,
      mission_id: task.mission_id,
      agent_id: a.agent_id,
      assignment_id: a.id,
    });
    await onTaskDone(sys, task.id);
  }
  return { summary: truncate(r.output.summary || "Contribution delivered", 200), result: { output_id: outputId, missing: r.output.missing_information }, meta: runMeta(r, inputs) };
}

// Journey C -------------------------------------------------------------------


// Cases -----------------------------------------------------------------------

/**
 * A case (one task following a procedure with stages) is reviewed as a whole: where it
 * stands, and the single question that would let the next step move. The agent asks the
 * role that owns the step. It never records a step itself — people do that.
 */
/**
 * A case advances through gates: the system computes the stage's numbers and asks the
 * department that owns it to approve moving on. No model is involved in that arithmetic.
 */
async function runCase(sys: Ctx, run: Run, a: Assignment) {
  const taskId = (run.inputs.task_id as string) ?? a.task_id;
  if (!taskId) throw new Error("This run has no case to review.");
  // Deliberate pacing: the arithmetic is instant, and a case that changed between two
  // blinks reads as if nothing happened. Long enough to see, short enough to demo.
  await new Promise((r) => setTimeout(r, 2500));
  const { opened } = await advanceCase(taskId);
  const { data: task } = await sys.db.from("tasks").select("case_ref,title,case_stage,status").eq("id", taskId).maybeSingle();
  const ref = (task?.case_ref as string) || (task?.title as string) || "The case";
  return {
    summary: opened
      ? `${ref}: stage ${task?.case_stage} needs a decision (${opened}).`
      : task?.status === "Done"
        ? `${ref} is closed.`
        : `${ref}: waiting on a decision already asked for.`,
    result: { opened },
  };
}

async function runMonitoring(sys: Ctx, run: Run, a: Assignment, rev: AgentRevision) {
  // Monitoring follows a connected record. An assignment without one has nothing to monitor:
  // say so plainly rather than failing on a missing record.
  if (!a.connection_id || !a.watch_record_id) {
    return {
      summary: `Nothing to monitor: this assignment doesn't follow a connected record (run “${truncate(run.trigger, 40)}”).`,
      result: { skipped: true },
    };
  }
  const conn = (await sys.db.from("connections").select("*").eq("id", a.connection_id).single()).data as Connection;
  if (!conn.reads_available) {
    await sys.db.from("assignments").update({ condition: "Observation unavailable — can't read the record", updated_at: now() }).eq("id", a.id);
    return { summary: "Couldn't read the record: observation unavailable. No assessment was changed.", result: { observation: "unavailable" } };
  }
  const record = (await sys.db.from("sandbox_records").select("*").eq("id", a.watch_record_id).single()).data as SandboxRecord;
  const { data: aSources } = await sys.db.from("assignment_sources").select("source_id").eq("assignment_id", a.id);
  const sources = await sourcesFor(sys, (aSources ?? []).map((s) => s.source_id));
  const plan = sources.find((s) => s.data.kind === "production_plan");
  const inventory = sources.find((s) => s.data.kind === "inventory");
  if (!plan || !inventory) {
    throw new Error("The assignment needs a production plan source and an inventory source.");
  }
  const procedure = a.procedure_revision_id
    ? ((await sys.db.from("procedure_revisions").select("*").eq("id", a.procedure_revision_id).single()).data as ProcedureRevision)
    : null;

  const need_qty = Number(plan.data.need_qty);
  const need_date = String(plan.data.need_date);
  const available = Number(inventory.data.available);
  const incoming = Number(record.data.quantity);
  const arrives_in_time = record.data.due_date <= need_date;
  const expected = available + (arrives_in_time ? incoming : 0);
  const shortfall = Math.max(0, need_qty - expected);

  let change: string | null = null;
  let gap_note: string | null = null;
  if (run.trigger === "event" && run.inputs.event_id) {
    const ev = (await sys.db.from("source_events").select("*").eq("id", run.inputs.event_id).single()).data as SourceEvent;
    change = `${record.external_id} ${String(ev.payload.field).replace("_", " ")} changed from ${ev.payload.from} to ${ev.payload.to} (event ${ev.external_event_id}).`;
  }
  if (run.trigger === "resume") {
    const { data: held } = await sys.db
      .from("source_events")
      .select("*")
      .eq("record_id", record.id)
      .eq("status", "Held")
      .contains("assignment_ids", [a.id]);
    if (held?.length) {
      change = `While paused, ${held.length} update(s) arrived: ${held
        .map((h) => `due date ${h.payload.from} → ${h.payload.to}`)
        .join("; ")}. Reassessed from the current record.`;
      await sys.db.from("source_events").update({ status: "Matched", note: "Considered on resume" }).in("id", held.map((h) => h.id));
    }
  }
  if (run.trigger === "reconcile" && conn.last_gap?.from) {
    gap_note = `Observation was unavailable from ${new Date(conn.last_gap.from).toLocaleString("en-GB")} to ${new Date(conn.last_gap.to ?? now()).toLocaleString("en-GB")}. Changes during that period can't be reconstructed; this assessment uses the record as read now.`;
  }

  const facts: DeliveryFacts = {
    item: String(plan.data.item ?? record.data.item),
    unit: plan.data.unit ? String(plan.data.unit) : undefined,
    record: record.external_id,
    supplier: record.data.supplier,
    need_qty,
    need_date,
    available,
    incoming,
    due_date: record.data.due_date,
    arrives_in_time,
    expected_by_need_date: expected,
    shortfall,
    risk_flag: record.data.risk_flag,
    record_version: record.version,
    change,
    gap_note,
  };

  const inputs = {
    record: { external_id: record.external_id, version: record.version, observed_at: now() },
    sources: refs(sources),
    agent_revision_id: rev.id,
    procedure_revision_id: a.procedure_revision_id,
    facts,
  };

  // Routine no-change: no model call, no new version, no request.
  const { data: prevRuns } = await sys.db
    .from("runs")
    .select("result")
    .eq("assignment_id", a.id)
    .eq("status", "Succeeded")
    .order("finished_at", { ascending: false })
    .limit(1);
  const prev = (prevRuns?.[0]?.result as { facts?: DeliveryFacts } | undefined)?.facts;
  const materiallySame =
    prev &&
    prev.shortfall === facts.shortfall &&
    prev.due_date === facts.due_date &&
    prev.available === facts.available &&
    prev.need_qty === facts.need_qty &&
    prev.expected_by_need_date === facts.expected_by_need_date &&
    !gap_note;

  let summary: string;
  let meta: Partial<Run> = { inputs } as Partial<Run>;
  if (materiallySame) {
    summary = "No relevant change — the assessment is unchanged.";
  } else {
    const r = await assessDelivery({
      instructions: `${rev.instructions}\n\n${a.instructions ? `Assignment instructions: ${a.instructions}` : ""}`,
      procedure: procedure ? `${procedure.instructions}\nSteps:\n${procedure.config.steps.map((s) => `- ${s}`).join("\n")}` : "",
      facts,
      trigger: change ?? gap_note ?? (run.trigger === "start" ? "Initial assessment" : "Reassessment"),
    });
    await boundary(sys, a.id);
    const output = (await sys.db.from("outputs").select("*").eq("id", a.output_id).single()).data as Output;
    const next = output.current_version + 1;
    await sys.db.from("outputs").update({ current_version: next, updated_at: now() }).eq("id", output.id);
    await sys.db.from("output_versions").insert({
      output_id: output.id,
      version: next,
      content: r.output.assessment_markdown,
      author_kind: "agent",
      agent_id: a.agent_id,
      run_id: run.id,
      based_on: output.current_version,
      sources: [
        ...refs(sources),
        { source_id: record.id, title: `${record.external_id} (${conn.name})`, version: record.version, observed_at: now(), kind: "connected_record" },
      ],
      note: change ?? gap_note ?? "Assessment",
    });
    summary = r.output.summary;
    meta = runMeta(r, inputs);
    await log(sys, {
      verb: "assessed",
      summary: `Assessment revised (version ${next}): ${truncate(r.output.summary, 140)}`,
      subject_kind: "output",
      subject_id: output.id,
      agent_id: a.agent_id,
      assignment_id: a.id,
      run_id: run.id,
    });
    if (prev && prev.shortfall !== facts.shortfall) {
      await notify(sys, a.responsible_id, {
        kind: "assessment_changed",
        title: facts.shortfall > 0 ? `${facts.shortfall}${facts.unit ? ` ${facts.unit} of` : ""} ${facts.item} now short by ${facts.need_date}` : `${facts.item} shortfall resolved`,
        body: change ?? "",
        link: `/assignments/${a.id}`,
      });
    }
  }

  await proposeIfNeeded(sys, run, a, record, facts, procedure);

  const { data: openAttempt } = await sys.db
    .from("action_attempts")
    .select("request_id")
    .eq("assignment_id", a.id)
    .eq("status", "AwaitingAuthorization")
    .is("decided_at", null)
    .limit(1);
  let condition = `Following ${record.external_id} · waiting for relevant updates`;
  if (openAttempt?.length) {
    const rule = await effectiveRule(sys, "set_risk_flag");
    condition = `Waiting for ${rule?.approver_id ? await nameOf(sys, rule.approver_id) : "an approver"} to decide a proposed change`;
  }
  await sys.db.from("assignments").update({ condition, updated_at: now() }).eq("id", a.id).eq("status", "Active");
  return { summary, result: { facts }, meta };
}

async function proposeIfNeeded(
  sys: Ctx,
  run: Run,
  a: Assignment,
  record: SandboxRecord,
  facts: DeliveryFacts,
  procedure: ProcedureRevision | null,
) {
  const plan = procedure?.config.on_shortfall;
  const allowedOps = a.scope.allowed_operations ?? [];

  // A proposal that no longer applies is superseded rather than left to be approved.
  if (facts.shortfall === 0) {
    const { data: stale } = await sys.db
      .from("action_attempts")
      .select("*")
      .eq("assignment_id", a.id)
      .eq("status", "AwaitingAuthorization")
      .is("decided_at", null);
    for (const s of (stale ?? []) as ActionAttempt[]) {
      await sys.db.from("action_attempts").update({ status: "Superseded", updated_at: now() }).eq("id", s.id);
      if (s.request_id) await sys.db.from("requests").update({ status: "Superseded", updated_at: now() }).eq("id", s.request_id).eq("status", "Open");
    }
    return;
  }
  if (!plan || !allowedOps.includes(plan.operation)) return;
  if (record.data.risk_flag === plan.value) return;

  // Event/operation identity: the same situation never creates a second proposal.
  const key = `${a.id}:${plan.operation}:${record.external_id}:due=${record.data.due_date}:${plan.value}`;
  const { data: existing } = await sys.db.from("action_attempts").select("id").eq("idempotency_key", key).maybeSingle();
  if (existing) return;

  const rule = await effectiveRule(sys, plan.operation);
  if (!rule || rule.rule === "denied") {
    await log(sys, {
      verb: "action_not_permitted",
      summary: `Would propose ${record.external_id} risk flag → ${plan.value}, but the current rule doesn't permit it. Nothing was proposed.`,
      subject_kind: "assignment",
      subject_id: a.id,
      assignment_id: a.id,
      run_id: run.id,
    });
    return;
  }

  const qty = (n: number) => (facts.unit ? `${n} ${facts.unit}` : String(n));
  const reason = `${qty(facts.shortfall)} ${facts.unit ? "of " : ""}${facts.item} short by ${facts.need_date}: ${record.external_id} is now due ${facts.due_date}.`;
  const { data: attempt, error } = await sys.db
    .from("action_attempts")
    .insert({
      org_id: a.org_id,
      assignment_id: a.id,
      run_id: run.id,
      connection_id: record.connection_id,
      operation: plan.operation,
      target_record_id: record.id,
      target_label: `${record.external_id} (${record.label})`,
      field: "risk_flag",
      current_value: record.data.risk_flag,
      proposed_value: plan.value,
      reason,
      evidence: { need_date: facts.need_date, due_date: facts.due_date, shortfall: facts.shortfall, record_version: record.version },
      idempotency_key: key,
      ...(rule.rule === "allowed" ? { decided_at: now(), authority_basis: "Current rule allows this operation without approval" } : {}),
    })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") return;
    throw new Error(error.message);
  }

  if (rule.rule === "approval" && rule.approver_id) {
    const responsible = await nameOf(sys, a.responsible_id);
    const { data: req } = await sys.db
      .from("requests")
      .insert({
        org_id: a.org_id,
        type: "authorization",
        recipient_id: rule.approver_id,
        requester_kind: "agent",
        requester_id: null,
        agent_id: a.agent_id,
        assignment_id: a.id,
        question: `Approve changing ${record.external_id}'s sandbox risk flag to “${plan.value}”?`,
        reason: `${reason} Proposed by the agent following this delivery for ${responsible}.`,
        context_excerpt: `Needed: ${qty(facts.need_qty)} ${facts.unit ? "of " : ""}${facts.item} by ${facts.need_date}. Available: ${qty(facts.available)}. Incoming: ${qty(facts.incoming)}, now due ${facts.due_date} (record version ${record.version}). Expected by the need date: ${qty(facts.expected_by_need_date)}.`,
        action_attempt_id: attempt.id,
      })
      .select()
      .single();
    await sys.db.from("action_attempts").update({ request_id: req.id }).eq("id", attempt.id);
    await notify(sys, rule.approver_id, {
      kind: "approval",
      title: "An action needs your approval",
      body: `${record.external_id} risk flag → ${plan.value}`,
      link: `/inbox?request=${req.id}`,
    });
    await log(sys, {
      verb: "proposed_action",
      summary: `Proposed ${record.external_id} risk flag → “${plan.value}”. Awaiting ${await nameOf(sys, rule.approver_id)}'s decision.`,
      subject_kind: "assignment",
      subject_id: a.id,
      assignment_id: a.id,
      run_id: run.id,
      agent_id: a.agent_id,
    });
  }
}
