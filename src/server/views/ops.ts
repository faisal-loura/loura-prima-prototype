import "server-only";
import type { Ctx } from "../context";
import { denied, notFound } from "../context";
import type {
  ActionAttempt,
  ActionEvidence,
  ActionRule,
  Activity,
  Agent,
  AgentRevision,
  Assignment,
  Connection,
  Member,
  Output,
  OutputVersion,
  Procedure,
  ProcedureRevision,
  Request,
  Run,
  SandboxRecord,
  Source,
  SourceEvent,
} from "../types";
import { lookup, type Lookup } from "./shared";

const acts = (L: Lookup, rows: Activity[]) =>
  rows.map((a) => ({
    id: a.id,
    actor: a.actor_kind === "agent" ? L.agent(a.agent_id) : a.actor_kind === "system" ? "Loura" : L.person(a.actor_id),
    actor_kind: a.actor_kind,
    verb: a.verb,
    summary: a.summary,
    subject_kind: a.subject_kind,
    subject_id: a.subject_id,
    control: a.control,
    created_at: a.created_at,
  }));

// ---------------------------------------------------------------------------
// Assignment detail — the same record from My Work, a task, or a conversation.
// ---------------------------------------------------------------------------

export async function assignment(ctx: Ctx, id: string) {
  const { data } = await ctx.db.from("assignments").select("*").eq("id", id).maybeSingle();
  if (!data) throw notFound("This assignment");
  const a = data as Assignment;
  const L = await lookup(ctx);

  const [rev, pendingRev, agent, revisions, procRev, runs, attempts, requests, activity, srcLinks, outputRes, recordRes, connRes, taskRes] =
    await Promise.all([
      ctx.db.from("agent_revisions").select("*").eq("id", a.agent_revision_id).single(),
      a.pending_agent_revision_id ? ctx.db.from("agent_revisions").select("*").eq("id", a.pending_agent_revision_id).single() : Promise.resolve({ data: null }),
      ctx.db.from("agents").select("*").eq("id", a.agent_id).single(),
      ctx.db.from("agent_revisions").select("id,revision,created_at").eq("agent_id", a.agent_id).order("revision", { ascending: false }),
      a.procedure_revision_id ? ctx.db.from("procedure_revisions").select("*").eq("id", a.procedure_revision_id).single() : Promise.resolve({ data: null }),
      ctx.db.from("runs").select("*").eq("assignment_id", a.id).order("created_at", { ascending: false }).limit(40),
      ctx.db.from("action_attempts").select("*").eq("assignment_id", a.id).order("created_at", { ascending: false }),
      ctx.db.from("requests").select("*").eq("assignment_id", a.id).order("created_at", { ascending: false }),
      ctx.db.from("activity").select("*").eq("assignment_id", a.id).order("created_at", { ascending: false }).limit(60),
      ctx.db.from("assignment_sources").select("source_id").eq("assignment_id", a.id),
      a.output_id ? ctx.db.from("outputs").select("*").eq("id", a.output_id).maybeSingle() : Promise.resolve({ data: null }),
      a.watch_record_id ? ctx.db.from("sandbox_records").select("*").eq("id", a.watch_record_id).maybeSingle() : Promise.resolve({ data: null }),
      a.connection_id ? ctx.db.from("connections").select("*").eq("id", a.connection_id).maybeSingle() : Promise.resolve({ data: null }),
      a.task_id ? ctx.db.from("tasks").select("id,title,status").eq("id", a.task_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);

  const attemptRows = (attempts.data ?? []) as ActionAttempt[];
  const evidence = attemptRows.length
    ? (((await ctx.db.from("action_evidence").select("*").in("attempt_id", attemptRows.map((x) => x.id)).order("created_at")).data ?? []) as ActionEvidence[])
    : [];
  const sourceIds = (srcLinks.data ?? []).map((s) => s.source_id);
  const sources = sourceIds.length ? (((await ctx.db.from("sources").select("*").in("id", sourceIds)).data ?? []) as Source[]) : [];

  const out = outputRes.data as Output | null;
  let currentContent: string | null = null;
  if (out) {
    const { data: v } = await ctx.db.from("output_versions").select("*").eq("output_id", out.id).eq("version", out.current_version).maybeSingle();
    currentContent = (v as OutputVersion | null)?.content ?? null;
  }
  const record = recordRes.data as SandboxRecord | null;
  const events = record
    ? (((await ctx.db.from("source_events").select("*").eq("record_id", record.id).order("received_at", { ascending: false }).limit(20)).data ?? []) as SourceEvent[])
    : [];
  const conn = connRes.data as Connection | null;
  // Fetched separately: procedures and their revisions reference each other, so an embed is ambiguous.
  const procRow = procRev.data as ProcedureRevision | null;
  const procParent = procRow
    ? ((await ctx.db.from("procedures").select("name, published_revision_id").eq("id", procRow.procedure_id).single()).data as { name: string; published_revision_id: string | null } | null)
    : null;
  const proc = procRow && procParent ? { ...procRow, procedures: procParent } : null;
  const reqRows = (requests.data ?? []) as Request[];

  // Prerequisites of the task this assignment works on; while any is open, the assignment is blocked.
  const depIds = a.task_id
    ? ((await ctx.db.from("task_dependencies").select("depends_on_id").eq("task_id", a.task_id)).data ?? []).map((x) => x.depends_on_id)
    : [];
  const waitingOn = depIds.length
    ? ((await ctx.db.from("tasks").select("id,title,status").in("id", depIds)).data ?? []).filter((x) => x.status !== "Done")
    : [];

  const canIntervene =
    a.responsible_id === ctx.me.user_id || a.created_by === ctx.me.user_id || ctx.me.is_supervisor;

  return {
    assignment: a,
    agent: { id: a.agent_id, name: (agent.data as Agent).name, published_revision_id: (agent.data as Agent).published_revision_id },
    revision: rev.data as AgentRevision,
    pending_revision: (pendingRev.data as AgentRevision | null) ?? null,
    revisions: revisions.data ?? [],
    procedure: proc ? { name: proc.procedures.name, revision: proc.revision, config: proc.config, instructions: proc.instructions } : null,
    responsible: L.person(a.responsible_id),
    responsible_active: L.member(a.responsible_id)?.status === "active",
    created_by: L.person(a.created_by),
    can_intervene: canIntervene,
    waiting_on: waitingOn as { id: string; title: string; status: string }[],
    task: (taskRes.data as { id: string; title: string; status: string } | null) ?? null,
    conversation_id: a.conversation_id,
    output: out ? { id: out.id, title: out.title, version: out.current_version, content: currentContent } : null,
    record,
    connection: conn
      ? { id: conn.id, name: conn.name, reads_available: conn.reads_available, events_available: conn.events_available, gap_started_at: conn.gap_started_at, last_gap: conn.last_gap, last_observation_at: conn.last_observation_at }
      : null,
    sources: sources.map((s) => ({ id: s.id, title: s.title, version: s.version, kind: s.kind, data: s.data, observed_at: s.observed_at })),
    runs: ((runs.data ?? []) as Run[]).map((r) => ({
      id: r.id, status: r.status, trigger: r.trigger, instruction: r.instruction, summary: r.summary, simulated: r.simulated, model: r.model,
      error: r.error, inputs: r.inputs, tool_calls: r.tool_calls, usage: r.usage, created_at: r.created_at, started_at: r.started_at, finished_at: r.finished_at,
    })),
    events: events.map((e) => ({ ...e, this_assignment: e.assignment_ids.includes(a.id) })),
    attempts: attemptRows.map((x) => ({
      ...x,
      decided_by_name: x.decided_by ? L.person(x.decided_by) : null,
      evidence: evidence.filter((e) => e.attempt_id === x.id),
      request_status: reqRows.find((r) => r.id === x.request_id)?.status ?? null,
      approver: reqRows.find((r) => r.id === x.request_id) ? L.person(reqRows.find((r) => r.id === x.request_id)!.recipient_id) : null,
    })),
    requests: reqRows.map((r) => ({ id: r.id, type: r.type, status: r.status, question: r.question, recipient: L.person(r.recipient_id), response_kind: r.response_kind, created_at: r.created_at })),
    activity: acts(L, (activity.data ?? []) as Activity[]),
  };
}

export async function startOptions(ctx: Ctx) {
  const [agents, procs, records, sources] = await Promise.all([
    ctx.db.from("agents").select("*").not("published_revision_id", "is", null).order("name"),
    ctx.db.from("procedures").select("*").not("published_revision_id", "is", null).order("name"),
    ctx.db.from("sandbox_records").select("*, connections(name)").order("external_id"),
    ctx.db.from("sources").select("id,title,kind,data,version").order("title"),
  ]);
  return {
    agents: ((agents.data ?? []) as Agent[]).map((a) => ({ id: a.id, name: a.name, purpose: a.purpose })),
    procedures: ((procs.data ?? []) as Procedure[]).map((p) => ({ id: p.id, name: p.name, purpose: p.purpose })),
    records: (records.data ?? []).map((r) => ({ id: r.id, external_id: r.external_id, label: r.label, data: r.data, connection: (r.connections as { name: string }).name })),
    sources: (sources.data ?? []).map((s) => ({ id: s.id, title: s.title, kind: s.kind, version: s.version, data: s.data })),
  };
}

// ---------------------------------------------------------------------------
// Sources and connections
// ---------------------------------------------------------------------------

export async function sources(ctx: Ctx) {
  const L = await lookup(ctx);
  const { data } = await ctx.db.from("sources").select("*").order("title");
  return {
    sources: ((data ?? []) as Source[]).map((s) => ({
      id: s.id, title: s.title, kind: s.kind, origin: s.origin, version: s.version, observed_at: s.observed_at,
      restricted: s.restricted, owner: L.person(s.owner_id), updated_at: s.updated_at,
    })),
  };
}

export async function source(ctx: Ctx, id: string) {
  const { data } = await ctx.db.from("sources").select("*").eq("id", id).maybeSingle();
  if (!data) throw notFound("This source");
  const s = data as Source;
  const L = await lookup(ctx);
  const [grants, asgLinks] = await Promise.all([
    ctx.db.from("source_grants").select("*").eq("source_id", s.id),
    ctx.db.from("assignment_sources").select("assignment_id, assignments(purpose,status)").eq("source_id", s.id),
  ]);
  return {
    source: s,
    owner: L.person(s.owner_id),
    is_owner: s.owner_id === ctx.me.user_id,
    grants: (grants.data ?? []).map((g) => ({ user_id: g.user_id, name: L.person(g.user_id) })),
    used_by_assignments: (asgLinks.data ?? []).map((x) => ({ id: x.assignment_id, ...(x.assignments as unknown as { purpose: string; status: string }) })),
  };
}

/** Published procedures a case can be opened from, with what their first stage expects. */
export async function caseProcedures(ctx: Ctx) {
  const { data } = await ctx.db
    .from("procedures")
    .select("id,name,purpose,published_revision_id,procedure_revisions!procedures_published_revision_fk(config)")
    .not("published_revision_id", "is", null)
    .order("name");
  const rows = (data ?? []) as {
    id: string;
    name: string;
    purpose: string;
    procedure_revisions?: { config?: { kind?: string; steps?: unknown[] } } | null;
  }[];
  return {
    procedures: rows
      .filter((p) => p.procedure_revisions?.config?.kind === "order_fulfilment")
      .map((p) => ({ id: p.id, name: p.name, purpose: p.purpose, steps: p.procedure_revisions?.config?.steps?.length ?? 0 })),
  };
}

export async function connections(ctx: Ctx) {
  const { data } = await ctx.db.from("connections").select("*").order("name");
  return { connections: (data ?? []) as Connection[], is_admin: ctx.me.is_admin };
}

export async function connection(ctx: Ctx, id: string) {
  const { data } = await ctx.db.from("connections").select("*").eq("id", id).maybeSingle();
  if (!data) throw notFound("This connection");
  const c = data as Connection;
  const L = await lookup(ctx);
  const [records, events, attempts, asg, log] = await Promise.all([
    ctx.db.from("sandbox_records").select("*").eq("connection_id", c.id).order("external_id"),
    ctx.db.from("source_events").select("*").eq("connection_id", c.id).order("received_at", { ascending: false }).limit(30),
    ctx.db.from("action_attempts").select("*").eq("connection_id", c.id).order("updated_at", { ascending: false }).limit(20),
    ctx.db.from("assignments").select("id,purpose,status,condition,watch_record_id,responsible_id").eq("connection_id", c.id).order("updated_at", { ascending: false }),
    ctx.db.from("activity").select("*").eq("subject_kind", "connection").eq("subject_id", c.id).order("created_at", { ascending: false }).limit(40),
  ]);
  return {
    connection: c,
    is_admin: ctx.me.is_admin,
    records: (records.data ?? []) as SandboxRecord[],
    events: (events.data ?? []) as SourceEvent[],
    attempts: (attempts.data ?? []) as ActionAttempt[],
    assignments: (asg.data ?? []).map((a) => ({ ...a, responsible: L.person(a.responsible_id) })),
    harness_log: acts(L, (log.data ?? []) as Activity[]),
  };
}

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

export async function admin(ctx: Ctx) {
  if (!ctx.me.is_admin) throw denied("Administration is only available to administrators.");
  const L = await lookup(ctx);
  const [members, rules, history] = await Promise.all([
    ctx.db.from("members").select("*").eq("is_system", false).order("full_name"),
    ctx.db.from("action_rules").select("*").order("operation"),
    ctx.db.from("activity").select("*").eq("control", true).order("created_at", { ascending: false }).limit(80),
  ]);
  return {
    members: (members.data ?? []) as Member[],
    rules: ((rules.data ?? []) as ActionRule[]).map((r) => ({ ...r, approver: r.approver_id ? L.person(r.approver_id) : null, updated_by_name: L.person(r.updated_by) })),
    history: acts(L, (history.data ?? []) as Activity[]),
  };
}
