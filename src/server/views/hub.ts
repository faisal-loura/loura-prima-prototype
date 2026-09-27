import "server-only";
import type { Ctx } from "../context";
import { notFound } from "../context";
import { modelAvailable, MODEL } from "../agent/runtime";
import type {
  ActionAttempt,
  ActionEvidence,
  Assignment,
  Member,
  Output,
  OutputVersion,
  Request,
  ReviewSubmission,
  SandboxRecord,
  Task,
  Update,
} from "../types";
import { lookup } from "./shared";

/**
 * The demo account presents a whole walkthrough from one identity, so the lists
 * that normally show "mine" show the organization's records instead.
 */
const mine = (ctx: Ctx) => !ctx.me.is_demo;
/** Filter fragments for "mine": empty for the demo account, which sees the organization. */
const myTaskFilter = (ctx: Ctx) => {
  const me = ctx.me.user_id;
  return `performer_id.eq.${me},responsible_id.eq.${me},created_by.eq.${me}`;
};

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export async function shell(ctx: Ctx) {
  const [{ count: needs }, { count: unread }, { data: org }, { data: ms }, { data: recent }] = await Promise.all([
    (mine(ctx) ? ctx.db.from("requests").select("id", { count: "exact", head: true }).eq("recipient_id", ctx.me.user_id) : ctx.db.from("requests").select("id", { count: "exact", head: true })).eq("status", "Open"),
    ctx.db.from("updates").select("id", { count: "exact", head: true }).eq("user_id", ctx.me.user_id).is("read_at", null),
    ctx.db.from("orgs").select("name").single(),
    ctx.db.from("members").select("user_id,full_name,title,email,status,is_system").order("full_name"),
    (mine(ctx) ? ctx.db.from("conversations").select("id,title,updated_at").eq("owner_id", ctx.me.user_id) : ctx.db.from("conversations").select("id,title,updated_at")).order("updated_at", { ascending: false }).limit(8),
  ]);
  return {
    me: ctx.me,
    org: org?.name ?? "Organization",
    model: { available: modelAvailable(), name: MODEL },
    counts: { needsResponse: needs ?? 0, unreadUpdates: unread ?? 0 },
    members: ((ms ?? []) as Member[]).filter((m) => !m.is_system),
    recent: (recent ?? []) as { id: string; title: string; updated_at: string }[],
  };
}

// ---------------------------------------------------------------------------
// Home: ask, what needs a response, and the latest tasks.
// ---------------------------------------------------------------------------

const HOME_TASKS = 4;
const HOME_REQUESTS = 20;

export async function home(ctx: Ctx) {
  const me = ctx.me.user_id;
  const [tasks, reqs] = await Promise.all([
    (mine(ctx)
      ? ctx.db.from("tasks").select("id,title,status,updated_at", { count: "exact" }).or(myTaskFilter(ctx))
      : ctx.db.from("tasks").select("id,title,status,updated_at", { count: "exact" })
    )
      .order("updated_at", { ascending: false })
      .limit(HOME_TASKS),
    (mine(ctx)
      ? ctx.db.from("requests").select("*", { count: "exact" }).eq("recipient_id", me)
      : ctx.db.from("requests").select("*", { count: "exact" })
    )
      .eq("status", "Open")
      .order("created_at", { ascending: false })
      .limit(HOME_REQUESTS),
  ]);

  return {
    tasks: (tasks.data ?? []) as Pick<Task, "id" | "title" | "status" | "updated_at">[],
    tasks_total: tasks.count ?? 0,
    needs: await summarize(ctx, (reqs.data ?? []) as Request[]),
    needs_total: reqs.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Inbox and requests
// ---------------------------------------------------------------------------

export interface RequestSummary {
  id: string;
  type: Request["type"];
  /** "task" when an agent proposed a task and is waiting for approval to start it. */
  kind: Request["type"] | "task";
  status: Request["status"];
  question: string;
  reason: string;
  requester: string;
  recipient: string;
  recipient_active: boolean;
  subject: string;
  created_at: string;
  responded_at: string | null;
  response_kind: Request["response_kind"];
}

export const isTaskProposal = (r: Pick<Request, "type" | "action_attempt_id" | "task_id" | "gate_key">) =>
  r.type === "authorization" && !r.action_attempt_id && !r.gate_key && Boolean(r.task_id);

async function summarize(ctx: Ctx, reqs: Request[]): Promise<RequestSummary[]> {
  const L = await lookup(ctx);
  const outputIds = [...new Set(reqs.map((r) => r.output_id).filter(Boolean))] as string[];
  const taskIds = [...new Set(reqs.map((r) => r.task_id).filter(Boolean))] as string[];
  const [{ data: outs }, { data: tasks }] = await Promise.all([
    outputIds.length ? ctx.db.from("outputs").select("id,title").in("id", outputIds) : Promise.resolve({ data: [] }),
    taskIds.length ? ctx.db.from("tasks").select("id,title").in("id", taskIds) : Promise.resolve({ data: [] }),
  ]);
  const outTitle = new Map((outs ?? []).map((o) => [o.id, o.title]));
  const taskTitle = new Map((tasks ?? []).map((t) => [t.id, t.title]));
  return reqs.map((r) => ({
    id: r.id,
    type: r.type,
    kind: isTaskProposal(r) ? ("task" as const) : r.type,
    status: r.status,
    question: r.question,
    reason: r.reason,
    requester: r.requester_kind === "agent" ? `${L.agent(r.agent_id)} (agent)` : L.person(r.requester_id),
    recipient: L.person(r.recipient_id),
    recipient_active: L.member(r.recipient_id)?.status === "active",
    subject:
      (r.task_id && taskTitle.get(r.task_id)) ||
      (r.output_id && `${outTitle.get(r.output_id) ?? "Document"}${r.output_version ? ` · Version ${r.output_version}` : ""}`) ||
      (r.type === "authorization" ? "Proposed action" : "Question"),
    created_at: r.created_at,
    responded_at: r.responded_at,
    response_kind: r.response_kind,
  }));
}

export async function inbox(ctx: Ctx) {
  const me = ctx.me.user_id;
  const [open, closed, updates] = await Promise.all([
    (mine(ctx) ? ctx.db.from("requests").select("*").eq("recipient_id", me) : ctx.db.from("requests").select("*"))
      .eq("status", "Open")
      .order("created_at", { ascending: false }),
    (mine(ctx) ? ctx.db.from("requests").select("*").eq("recipient_id", me) : ctx.db.from("requests").select("*"))
      .neq("status", "Open")
      .order("updated_at", { ascending: false })
      .limit(15),
    ctx.db.from("updates").select("*").eq("user_id", me).order("created_at", { ascending: false }).limit(40),
  ]);
  return {
    needs: await summarize(ctx, (open.data ?? []) as Request[]),
    history: await summarize(ctx, (closed.data ?? []) as Request[]),
    updates: (updates.data ?? []) as Update[],
  };
}

export async function request(ctx: Ctx, id: string) {
  const { data } = await ctx.db.from("requests").select("*").eq("id", id).maybeSingle();
  if (!data) throw notFound("This request");
  const r = data as Request;
  const L = await lookup(ctx);

  const [task, output, submission, attempt, evidenceSource, assignment] = await Promise.all([
    r.task_id ? ctx.db.from("tasks").select("id,title,status,expected_result").eq("id", r.task_id).maybeSingle() : null,
    r.output_id ? ctx.db.from("outputs").select("*").eq("id", r.output_id).maybeSingle() : null,
    r.review_submission_id ? ctx.db.from("review_submissions").select("*").eq("id", r.review_submission_id).maybeSingle() : null,
    r.action_attempt_id ? ctx.db.from("action_attempts").select("*").eq("id", r.action_attempt_id).maybeSingle() : null,
    r.response_evidence_source_id ? ctx.db.from("sources").select("id,title").eq("id", r.response_evidence_source_id).maybeSingle() : null,
    r.assignment_id ? ctx.db.from("assignments").select("id,purpose,status,conversation_id").eq("id", r.assignment_id).maybeSingle() : null,
  ]);

  let outputView: { id: string; title: string; version: number; current_version: number; content: string | null } | null = null;
  if (r.output_id) {
    const o = output?.data as Output | null;
    if (o) {
      const { data: v } = await ctx.db
        .from("output_versions")
        .select("content")
        .eq("output_id", o.id)
        .eq("version", r.output_version ?? o.current_version)
        .maybeSingle();
      outputView = { id: o.id, title: o.title, version: r.output_version ?? o.current_version, current_version: o.current_version, content: (v as OutputVersion | null)?.content ?? null };
    }
  }

  let reviewView = null;
  if (submission?.data) {
    const s = submission.data as ReviewSubmission;
    const { data: siblings } = await ctx.db.from("requests").select("*").eq("review_submission_id", s.id);
    reviewView = {
      id: s.id,
      status: s.status,
      version: s.version,
      requested_by: L.person(s.requested_by),
      note: s.note,
      reviewers: s.reviewer_ids.map((uid) => {
        const rr = ((siblings ?? []) as Request[]).find((x) => x.recipient_id === uid);
        return { name: L.person(uid), decision: rr?.response_kind ?? null, text: rr?.response_text ?? null, request_status: rr?.status ?? null };
      }),
    };
  }

  let actionView = null;
  if (attempt?.data) {
    const at = attempt.data as ActionAttempt;
    const [{ data: ev }, { data: rec }] = await Promise.all([
      ctx.db.from("action_evidence").select("*").eq("attempt_id", at.id).order("created_at"),
      at.target_record_id ? ctx.db.from("sandbox_records").select("*").eq("id", at.target_record_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    actionView = {
      ...at,
      /** What the agent read when it drafted the change (record version, supporting facts). */
      drafted: at.evidence,
      decided_by_name: at.decided_by ? L.person(at.decided_by) : null,
      evidence: (ev ?? []) as ActionEvidence[],
      record: rec as SandboxRecord | null,
    };
  }

  return {
    request: r,
    is_task_proposal: isTaskProposal(r),
    requester: r.requester_kind === "agent" ? L.agent(r.agent_id) : L.person(r.requester_id),
    requester_kind: r.requester_kind,
    recipient: L.person(r.recipient_id),
    recipient_active: L.member(r.recipient_id)?.status === "active",
    responded_by: r.responded_by ? L.person(r.responded_by) : null,
    suggested: r.suggested_user_id ? L.person(r.suggested_user_id) : null,
    is_recipient: r.recipient_id === ctx.me.user_id,
    can_respond: r.recipient_id === ctx.me.user_id || ctx.me.is_demo,
    is_requester: r.requester_id === ctx.me.user_id,
    task: (task?.data as Pick<Task, "id" | "title" | "status" | "expected_result"> | null) ?? null,
    output: outputView,
    output_hidden: Boolean(r.output_id && !output?.data),
    review: reviewView,
    action: actionView,
    evidence_source: (evidenceSource?.data as { id: string; title: string } | null) ?? null,
    assignment: (assignment?.data as Pick<Assignment, "id" | "purpose" | "status" | "conversation_id"> | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// My Work: personal contributions and delegated activity, same records.
// ---------------------------------------------------------------------------

export async function myWork(ctx: Ctx) {
  const L = await lookup(ctx);
  const me = ctx.me.user_id;
  const [tasks, outputs, grants, assignments] = await Promise.all([
    (mine(ctx) ? ctx.db.from("tasks").select("*").or(myTaskFilter(ctx)) : ctx.db.from("tasks").select("*")).order("updated_at", { ascending: false }),
    ctx.db.from("outputs").select("*").order("updated_at", { ascending: false }),
    ctx.db.from("output_grants").select("output_id,access").eq("user_id", me),
    (mine(ctx) ? ctx.db.from("assignments").select("*").or(`responsible_id.eq.${me},created_by.eq.${me}`) : ctx.db.from("assignments").select("*")).order("updated_at", { ascending: false }),
  ]);

  const taskRows = (tasks.data ?? []) as Task[];
  const asgRows = (assignments.data ?? []) as Assignment[];

  // Prerequisites that aren't done block a task — and the agent assignment working on it.
  const blockedIds = [...new Set([...taskRows.map((t) => t.id), ...(asgRows.map((a) => a.task_id).filter(Boolean) as string[])])];
  const deps = blockedIds.length
    ? (await ctx.db.from("task_dependencies").select("task_id,depends_on_id").in("task_id", blockedIds)).data ?? []
    : [];
  const depIds = [...new Set(deps.map((d) => d.depends_on_id))];
  const depTasks = depIds.length ? ((await ctx.db.from("tasks").select("id,title,status").in("id", depIds)).data ?? []) : [];
  const depStatus = new Map(depTasks.map((d) => [d.id, d]));
  const waitingOn = (taskId: string | null) =>
    deps
      .filter((d) => d.task_id === taskId)
      .map((d) => depStatus.get(d.depends_on_id))
      .filter((d): d is { id: string; title: string; status: string } => Boolean(d && d.status !== "Done"))
      .map((d) => ({ id: d.id, title: d.title }));
  const grantMap = new Map((grants.data ?? []).map((g) => [g.output_id, g.access as string]));

  return {
    tasks: taskRows.map((t) => {
      return {
        id: t.id,
        title: t.title,
        status: t.status,
        performer: t.performer_kind === "agent" ? L.agent(t.agent_id) : t.performer_id ? L.person(t.performer_id) : "Unassigned",
        performer_kind: t.performer_kind,
        relation: t.performer_id === me ? ("assigned_to_me" as const) : ("requested_by_me" as const),
        waiting_on: waitingOn(t.id),
        updated_at: t.updated_at,
      };
    }),
    outputs: ((outputs.data ?? []) as Output[])
      .filter((o) => o.owner_id === me || grantMap.has(o.id))
      .map((o) => ({
        id: o.id,
        title: o.title,
        version: o.current_version,
        relation: o.owner_id === me ? "Owner" : `Shared with you · can ${grantMap.get(o.id)}`,
        updated_at: o.updated_at,
      })),
    assignments: asgRows.map((a) => ({
      id: a.id,
      purpose: a.purpose,
      status: a.status,
      condition: a.condition,
      kind: a.kind,
      agent: L.agent(a.agent_id),
      responsible: L.person(a.responsible_id),
      relation: a.responsible_id === me ? "You're responsible" : "You started it",
      waiting_on: waitingOn(a.task_id),
      updated_at: a.updated_at,
    })),
  };
}

// ---------------------------------------------------------------------------
// Recents: threads, tasks, and documents in one list, most recently updated first.
// ---------------------------------------------------------------------------

export interface RecentItem {
  kind: "thread" | "task" | "output";
  id: string;
  title: string;
  href: string;
  updated_at: string;
  /** Tasks that are done or cancelled go under "Completed". */
  completed: boolean;
}

export async function recents(ctx: Ctx) {
  const me = ctx.me.user_id;
  const [convs, tasks, outputs, grants] = await Promise.all([
    (mine(ctx) ? ctx.db.from("conversations").select("id,title,updated_at").eq("owner_id", me) : ctx.db.from("conversations").select("id,title,updated_at")).order("updated_at", { ascending: false }).limit(100),
    (mine(ctx)
      ? ctx.db.from("tasks").select("id,title,status,updated_at").or(myTaskFilter(ctx))
      : ctx.db.from("tasks").select("id,title,status,updated_at")
    )
      .order("updated_at", { ascending: false })
      .limit(100),
    ctx.db.from("outputs").select("id,title,owner_id,updated_at").order("updated_at", { ascending: false }).limit(100),
    ctx.db.from("output_grants").select("output_id").eq("user_id", me),
  ]);
  const granted = new Set((grants.data ?? []).map((g) => g.output_id));
  const canSeeOutput = (ownerId: string | null) => !mine(ctx) || ownerId === me;
  const items: RecentItem[] = [
    ...(convs.data ?? []).map((c) => ({ kind: "thread" as const, id: c.id, title: c.title, href: `/conversations/${c.id}`, updated_at: c.updated_at, completed: false })),
    ...((tasks.data ?? []) as Pick<Task, "id" | "title" | "status" | "updated_at">[]).map((t) => ({
      kind: "task" as const,
      id: t.id,
      title: t.title,
      href: `/tasks/${t.id}`,
      updated_at: t.updated_at,
      completed: t.status === "Done" || t.status === "Cancelled",
    })),
    ...((outputs.data ?? []) as Pick<Output, "id" | "title" | "owner_id" | "updated_at">[])
      .filter((o) => canSeeOutput(o.owner_id) || granted.has(o.id))
      .map((o) => ({ kind: "output" as const, id: o.id, title: o.title, href: `/outputs/${o.id}`, updated_at: o.updated_at, completed: false })),
  ];
  items.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return { items };
}

// ---------------------------------------------------------------------------
// Control Room: oversight of cases (tasks), the queue waiting on people, the
// agent assignments behind them, and how much the agents are being used.
// ---------------------------------------------------------------------------

/** A case is a task; this is its state in oversight words. */
const CASE_STATE: Record<string, string> = {
  Open: "Proposed",
  InProgress: "In progress",
  InReview: "Awaiting review",
  Done: "Completed",
  Cancelled: "Cancelled",
};

const REQUEST_STEP: Record<string, string> = {
  information: "Answer the agent's question",
  review: "Review the submitted version",
  authorization: "Review the proposed action",
  task: "Approve the proposed task",
};

const shortId = (id: string) => `case-${id.replace(/-/g, "").slice(0, 4)}`;

export async function controlRoom(ctx: Ctx) {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const [tasksRes, reqsRes, asgRes, runsRes, membersRes, depsRes] = await Promise.all([
    ctx.db.from("tasks").select("id,title,status,updated_at,responsible_id,performer_kind,agent_id,assignment_id").order("updated_at", { ascending: false }),
    ctx.db.from("requests").select("*").eq("status", "Open").order("created_at"),
    ctx.db.from("assignments").select("id,purpose,status,task_id,responsible_id,updated_at").order("updated_at", { ascending: false }),
    ctx.db.from("runs").select("id,status,created_at").gte("created_at", since),
    ctx.db.from("members").select("user_id", { count: "exact", head: true }).eq("status", "active").eq("is_system", false),
    ctx.db.from("task_dependencies").select("task_id,depends_on_id"),
  ]);

  const L = await lookup(ctx);
  const tasks = (tasksRes.data ?? []) as Pick<Task, "id" | "title" | "status" | "updated_at" | "responsible_id" | "performer_kind" | "agent_id" | "assignment_id">[];
  const reqs = (reqsRes.data ?? []) as Request[];
  const asgs = (asgRes.data ?? []) as Pick<Assignment, "id" | "purpose" | "status" | "task_id" | "responsible_id" | "updated_at">[];
  const runs = (runsRes.data ?? []) as { id: string; status: string; created_at: string }[];

  const open = tasks.filter((t) => t.status !== "Done" && t.status !== "Cancelled");
  const openIds = new Set(open.map((t) => t.id));

  // Unmet prerequisites among the tasks the reader can see.
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const unmet = new Map<string, string[]>();
  for (const d of depsRes.data ?? []) {
    const dep = byId.get(d.depends_on_id);
    if (!openIds.has(d.task_id) || !dep || dep.status === "Done") continue;
    unmet.set(d.task_id, [...(unmet.get(d.task_id) ?? []), dep.title]);
  }

  const reqKind = (r: Request) => (isTaskProposal(r) ? "task" : r.type);
  const openByTask = new Map<string, Request[]>();
  for (const r of reqs) if (r.task_id) openByTask.set(r.task_id, [...(openByTask.get(r.task_id) ?? []), r]);

  // The queue: every case waiting on a person, most urgent (longest waiting) first.
  const queue = open
    .map((t) => {
      const waiting = (openByTask.get(t.id) ?? [])[0];
      const blocked = unmet.get(t.id);
      if (!waiting && !blocked) return null;
      const kind = waiting ? reqKind(waiting) : null;
      return {
        id: t.id,
        short_id: shortId(t.id),
        title: t.title,
        state: blocked && !waiting ? "Blocked" : CASE_STATE[t.status] ?? t.status,
        blocked: Boolean(blocked && !waiting),
        next_step: waiting ? REQUEST_STEP[kind ?? ""] ?? "Respond to the request" : `Waiting for ${blocked?.join(", ")}`,
        next_detail: waiting ? (waiting.recipient_id === ctx.me.user_id ? "You" : L.person(waiting.recipient_id)) : "Another case must finish first",
        request_id: waiting?.id ?? null,
        is_recipient: waiting?.recipient_id === ctx.me.user_id || ctx.me.is_demo,
        since: waiting?.created_at ?? t.updated_at,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((a, b) => a.since.localeCompare(b.since));

  const bucket = (iso: string) => {
    const hours = (Date.now() - new Date(iso).getTime()) / 3600_000;
    return hours < 24 ? "0–24h" : hours < 48 ? "24–48h" : "48h+";
  };
  const count = <T,>(rows: T[], key: (r: T) => string) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
    return m;
  };

  const blockerCounts = count(
    [
      ...reqs.filter((r) => r.task_id && openIds.has(r.task_id)).map((r) => REQUEST_STEP[reqKind(r)] ?? "Open request"),
      ...[...unmet.values()].map(() => "Waiting for another case"),
    ],
    (x) => x,
  );

  const runState: Record<string, string> = {
    Succeeded: "Succeeded",
    Failed: "Failed",
    Stopped: "Failed",
    Queued: "Waiting",
    Waiting: "Waiting",
    Running: "In progress",
  };

  return {
    attention: queue.slice(0, 5),
    queue,
    cases_by_state: [...count(open, (t) => CASE_STATE[t.status] ?? t.status)].map(([label, value]) => ({ label, value })),
    stage_age: ["0–24h", "24–48h", "48h+"].map((label) => ({ label, value: open.filter((t) => bucket(t.updated_at) === label).length })),
    blockers: [...blockerCounts].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    completed: tasks.filter((t) => t.status === "Done").length,
    assignments: asgs.map((a) => ({
      id: a.id,
      purpose: a.purpose,
      status: a.status,
      responsible: L.person(a.responsible_id),
      case: a.task_id ? { id: a.task_id, short_id: shortId(a.task_id), title: byId.get(a.task_id)?.title ?? null } : null,
    })),
    usage: {
      runs: runs.length,
      runs_by_outcome: ["Succeeded", "Failed", "Waiting", "In progress"].map((label) => ({
        label,
        value: runs.filter((r) => runState[r.status] === label).length,
      })),
      seats: membersRes.count ?? 0,
      assignments_active: asgs.filter((a) => a.status === "Active").length,
      assignments_total: asgs.length,
      assignments_by_status: ["Draft", "Active", "Pausing", "Paused", "Ending", "Ended"].map((label) => ({
        label,
        value: asgs.filter((a) => a.status === label).length,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// Search — only permitted records come back (RLS applies to every query).
// ---------------------------------------------------------------------------

export async function search(ctx: Ctx, q: string) {
  const term = q.trim();
  if (!term) return { results: [] };
  const like = `%${term.replace(/[%_]/g, "")}%`;
  const [t, o, c, a, s] = await Promise.all([
    ctx.db.from("tasks").select("id,title,status").ilike("title", like).limit(5),
    ctx.db.from("outputs").select("id,title,current_version").ilike("title", like).limit(5),
    ctx.db.from("conversations").select("id,title").ilike("title", like).limit(5),
    ctx.db.from("assignments").select("id,purpose,status").ilike("purpose", like).limit(5),
    ctx.db.from("sources").select("id,title,kind").ilike("title", like).limit(5),
  ]);
  return {
    results: [
      ...(t.data ?? []).map((x) => ({ kind: "Task", title: x.title, detail: x.status, href: `/tasks/${x.id}` })),
      ...(o.data ?? []).map((x) => ({ kind: "Document", title: x.title, detail: `Version ${x.current_version}`, href: `/outputs/${x.id}` })),
      ...(c.data ?? []).map((x) => ({ kind: "Conversation", title: x.title, detail: "", href: `/conversations/${x.id}` })),
      ...(a.data ?? []).map((x) => ({ kind: "Agent assignment", title: x.purpose, detail: x.status, href: `/assignments/${x.id}` })),
      ...(s.data ?? []).map((x) => ({ kind: "Source", title: x.title, detail: x.kind, href: `/sources/${x.id}` })),
    ],
  };
}
