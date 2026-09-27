import "server-only";
import { conflict, notFound, OpError, type Ctx } from "../context";
import type { CaseStep, CaseStepStatus, ProcedureRevision, Task } from "../types";
import { ORDER_FULFILMENT_STEPS, type CaseConfig, type CasePath, type StepTemplate } from "../procedures/order-fulfilment";
import { assert, getOr404, log, now } from "./common";
import { advanceCase } from "./case-engine";

const PATHS: CasePath[] = ["A", "B", "C"];

/** A published procedure describes a case when its config names a kind and its steps. */
export const caseConfig = (rev: { config?: unknown } | null) => {
  const c = rev?.config as Partial<CaseConfig> | undefined;
  return typeof c?.kind === "string" && Array.isArray(c.steps) ? (c as CaseConfig) : null;
};

/** A step outside the case's chosen path doesn't apply to it. */
export const stepApplies = (step: Pick<CaseStep, "paths">, path: string | null) =>
  !path || step.paths.length === 0 || step.paths.includes(path);

/**
 * Open a case from a published procedure: one task, with the procedure's steps as its state.
 * Nothing about the order is assumed — the path stays undecided until a person chooses it.
 */
export async function openCase(
  ctx: Ctx,
  args: { procedure_id: string; case_ref: string; title: string; expected_result?: string; responsible_id?: string; facts?: Record<string, unknown> },
) {
  assert(args.case_ref.trim(), new OpError("Give the case its reference, for example the sales order number."));
  assert(args.title.trim(), new OpError("Give the case a title."));

  const { data: proc } = await ctx.db.from("procedures").select("id,name,published_revision_id").eq("id", args.procedure_id).maybeSingle();
  if (!proc) throw notFound("This procedure");
  assert(proc.published_revision_id, new OpError("This procedure has no published revision yet."));
  const { data: rev } = await ctx.db.from("procedure_revisions").select("*").eq("id", proc.published_revision_id).maybeSingle();
  const config = caseConfig(rev as ProcedureRevision | null);
  assert(config, new OpError("This procedure doesn't describe a case with steps."));

  const responsible = args.responsible_id ?? ctx.me.user_id;
  const { data: task, error } = await ctx.db
    .from("tasks")
    .insert({
      org_id: ctx.me.org_id,
      title: args.title.trim(),
      expected_result: args.expected_result?.trim() ?? `${proc.name} carried through for ${args.case_ref.trim()}.`,
      status: "InProgress",
      responsible_id: responsible,
      created_by: ctx.me.user_id,
      procedure_revision_id: rev!.id,
      case_ref: args.case_ref.trim(),
      case_facts: args.facts ?? {},
    })
    .select()
    .single();
  if (error) throw new OpError(error.message);

  await insertSteps(ctx, task.id as string, config!.steps ?? ORDER_FULFILMENT_STEPS);
  await log(ctx, {
    verb: "created",
    summary: `Opened the case “${task.title}” (${task.case_ref}) following ${proc.name}.`,
    subject_kind: "task",
    subject_id: task.id,
  });
  await advanceCase(task.id as string);
  return { task_id: task.id as string, message: `Case ${task.case_ref} is open. The first decision is with Sales.` };
}

async function insertSteps(ctx: Ctx, taskId: string, steps: StepTemplate[]) {
  const { error } = await ctx.db.from("case_steps").insert(
    steps.map((s) => ({
      org_id: ctx.me.org_id,
      task_id: taskId,
      stage_no: s.stage_no,
      stage_name: s.stage_name,
      step_no: s.step_no,
      title: s.title,
      owner_role: s.owner_role,
      tools: s.tools,
      paths: s.paths,
      confidence: s.confidence,
    })),
  );
  if (error) throw new OpError(error.message);
}

/** Record where a step stands. Only a person does this; the agent asks, it doesn't decide. */
export async function setCaseStep(ctx: Ctx, args: { step_id: string; status?: CaseStepStatus; note?: string }) {
  const step = await getOr404<CaseStep>(ctx, "case_steps", args.step_id, "This step");
  const task = await getOr404<Task>(ctx, "tasks", step.task_id, "This case");
  assert(task.status !== "Done" && task.status !== "Cancelled", conflict("This case is closed. Reopen it to record a step."));
  if (args.status && !stepApplies(step, task.case_path)) {
    throw new OpError(`Step ${step.step_no} isn't part of path ${task.case_path} for this case.`);
  }

  const patch: Record<string, unknown> = { updated_by: ctx.me.user_id, updated_at: now() };
  if (args.status) patch.status = args.status;
  if (args.note !== undefined) patch.note = args.note.trim();
  // Recording a step clears the question that was holding it.
  if (args.status && args.status !== "Blocked") patch.request_id = null;

  const { error } = await ctx.db.from("case_steps").update(patch).eq("id", step.id);
  if (error) throw new OpError(error.message);

  if (args.status && args.status !== step.status) {
    await log(ctx, {
      verb: "recorded",
      summary: `Step ${step.step_no} (${step.title}) — ${WORDS[args.status]}${args.note?.trim() ? `: ${args.note.trim()}` : ""}`,
      subject_kind: "task",
      subject_id: task.id,
    });
    await ctx.db.from("tasks").update({ updated_at: now() }).eq("id", task.id);
    await nudgeAgent(ctx, task);
  }
  return { message: `Step ${step.step_no} recorded.` };
}

const WORDS: Record<CaseStepStatus, string> = {
  NotStarted: "not started",
  InProgress: "in progress",
  Done: "done",
  Blocked: "blocked",
  Skipped: "skipped",
};

/**
 * Choose which of the three situations this order is in. Steps outside the chosen path stop
 * applying; they are never deleted, so the decision stays visible.
 */
export async function setCasePath(ctx: Ctx, args: { task_id: string; path: CasePath; note?: string }) {
  assert(PATHS.includes(args.path), new OpError("The path is A, B, or C."));
  const task = await getOr404<Task>(ctx, "tasks", args.task_id, "This case");
  assert(task.procedure_revision_id, new OpError("This task isn't a case."));
  const { error } = await ctx.db.from("tasks").update({ case_path: args.path, updated_at: now() }).eq("id", task.id);
  if (error) throw new OpError(error.message);
  await log(ctx, {
    verb: "decided",
    summary: `${task.case_ref}: ${PATH_WORDS[args.path]}${args.note?.trim() ? ` — ${args.note.trim()}` : ""}`,
    subject_kind: "task",
    subject_id: task.id,
  });
  await nudgeAgent(ctx, task);
  return { message: `Path ${args.path} recorded.` };
}

export const PATH_WORDS: Record<CasePath, string> = {
  A: "all in finished-goods stock",
  B: "none in stock — produced in full",
  C: "partly in stock — the remainder is produced",
};

/** After a person records something by hand, work out what the case needs next. */
async function nudgeAgent(_ctx: Ctx, task: Pick<Task, "id">) {
  await advanceCase(task.id);
}
