import "server-only";
import { conflict, denied, OpError, type Ctx } from "../context";
import { kick } from "../kick";
import type { Agent, Task } from "../types";
import { assert, getOr404, log, notify, now, truncate } from "./common";

// ---------------------------------------------------------------------------
// Tasks — proposed by an agent from a conversation, started once a person approves.
// ---------------------------------------------------------------------------

export async function updateTask(
  ctx: Ctx,
  args: { task_id: string; title?: string; expected_result?: string; requires_review?: boolean },
) {
  const task = await getOr404<Task>(ctx, "tasks", args.task_id, "This task");
  const patch: Record<string, unknown> = { updated_at: now() };
  if (args.title?.trim()) patch.title = args.title.trim();
  if (args.expected_result !== undefined) patch.expected_result = args.expected_result.trim();
  if (args.requires_review !== undefined) patch.requires_review = args.requires_review;
  await ctx.db.from("tasks").update(patch).eq("id", task.id);
  return { ok: true };
}

/** Titles of prerequisites that are not Done. */
export async function unmetPrerequisites(ctx: Ctx, taskId: string): Promise<{ id: string; title: string }[]> {
  const { data: deps } = await ctx.db.from("task_dependencies").select("depends_on_id").eq("task_id", taskId);
  const ids = (deps ?? []).map((d) => d.depends_on_id);
  if (!ids.length) return [];
  const { data: tasks } = await ctx.db.from("tasks").select("id,title,status").in("id", ids);
  return (tasks ?? []).filter((t) => t.status !== "Done").map((t) => ({ id: t.id, title: t.title }));
}

/**
 * Delegation to an agent creates an assignment. Confirming it starts eligible
 * execution; unmet prerequisites keep only this contribution waiting.
 */
export async function delegateTaskToAgent(
  ctx: Ctx,
  args: { task_id: string; agent_id: string; instructions?: string; source_ids?: string[] },
) {
  const task = await getOr404<Task>(ctx, "tasks", args.task_id, "This task");
  assert(!["Done", "Cancelled"].includes(task.status), conflict(`This task is ${task.status.toLowerCase()}.`));
  const agent = await getOr404<Agent>(ctx, "agents", args.agent_id, "This agent");
  assert(agent.published_revision_id, new OpError(`${agent.name} has no published revision.`));
  if (task.assignment_id && task.performer_kind === "agent") {
    const { data: prev } = await ctx.db.from("assignments").select("status").eq("id", task.assignment_id).maybeSingle();
    assert(!prev || prev.status === "Ended", new OpError("An agent is already assigned to this task. End that assignment first."));
  }

  const { data: assignment, error } = await ctx.db
    .from("assignments")
    .insert({
      org_id: ctx.me.org_id,
      agent_id: agent.id,
      agent_revision_id: agent.published_revision_id,
      kind: "contribution",
      purpose: task.title,
      instructions: args.instructions?.trim() || task.expected_result,
      status: "Active",
      responsible_id: ctx.me.user_id,
      created_by: ctx.me.user_id,
      mission_id: task.mission_id,
      task_id: task.id,
      space_id: task.mission_id ? null : task.space_id,
    })
    .select()
    .single();
  if (error) throw new OpError(error.message);

  if (args.source_ids?.length) {
    await ctx.db.from("assignment_sources").insert(args.source_ids.map((source_id) => ({ assignment_id: assignment.id, source_id })));
  }

  await ctx.db
    .from("tasks")
    .update({
      performer_kind: "agent",
      performer_id: null,
      agent_id: agent.id,
      assignment_id: assignment.id,
      responsible_id: ctx.me.user_id,
      updated_at: now(),
    })
    .eq("id", task.id);

  await log(ctx, {
    verb: "delegated",
    summary: `Delegated “${task.title}” to ${agent.name}. ${ctx.me.full_name} remains responsible.`,
    subject_kind: "task",
    subject_id: task.id,
    mission_id: task.mission_id,
    assignment_id: assignment.id,
  });
  await reevaluateTask(ctx, task.id);
  return { assignment_id: assignment.id as string };
}

/**
 * Start an agent contribution once its prerequisites hold. Only the dependent
 * contribution waits; independent work carries on.
 */
export async function reevaluateTask(ctx: Ctx, taskId: string) {
  const { data: task } = await ctx.db.from("tasks").select("*").eq("id", taskId).maybeSingle();
  if (!task || ["Done", "Cancelled", "InReview"].includes(task.status)) return;
  if (task.performer_kind !== "agent" || !task.assignment_id) return;
  const { data: a } = await ctx.db.from("assignments").select("*").eq("id", task.assignment_id).maybeSingle();
  if (!a || a.status !== "Active") return;

  const unmet = await unmetPrerequisites(ctx, task.id);
  if (unmet.length) {
    await ctx.db
      .from("assignments")
      .update({ condition: `Waiting for: ${unmet.map((u) => u.title).join(", ")}`, updated_at: now() })
      .eq("id", a.id);
    return;
  }

  // Already produced a result and is awaiting a person (review, or a revision instruction)?
  if (task.output_id && task.status === "InProgress") return;

  const { data: live } = await ctx.db
    .from("runs")
    .select("id")
    .eq("assignment_id", a.id)
    .in("status", ["Queued", "Running"]);
  if (live?.length) return;

  await ctx.db.from("runs").insert({
    org_id: a.org_id,
    assignment_id: a.id,
    trigger: "contribution",
    instruction: a.instructions,
    inputs: { task_id: task.id },
    created_by: ctx.system ? null : ctx.me.user_id,
  });
  await ctx.db.from("assignments").update({ condition: "Working on the contribution", updated_at: now() }).eq("id", a.id);
  if (task.status === "Open") {
    await ctx.db.from("tasks").update({ status: "InProgress", updated_at: now() }).eq("id", task.id);
  }
  await log(ctx, {
    verb: "started",
    summary: `Prerequisites met — started “${task.title}”`,
    subject_kind: "task",
    subject_id: task.id,
    mission_id: task.mission_id,
    assignment_id: a.id,
    agent_id: a.agent_id,
  });
  kick();
}

async function reevaluateDependents(ctx: Ctx, taskId: string) {
  const { data: dependents } = await ctx.db.from("task_dependencies").select("task_id").eq("depends_on_id", taskId);
  for (const d of dependents ?? []) {
    const { data: t } = await ctx.db.from("tasks").select("*").eq("id", d.task_id).maybeSingle();
    if (!t) continue;
    if (t.performer_kind === "agent") await reevaluateTask(ctx, t.id);
    else if (t.performer_id && (await unmetPrerequisites(ctx, t.id)).length === 0) {
      await notify(ctx, t.performer_id, {
        kind: "unblocked",
        title: `“${t.title}” is no longer waiting`,
        body: "Its prerequisites are done.",
        link: `/tasks/${t.id}`,
      });
    }
  }
}

/** Record completion. Only Done when every completion condition holds. */
export async function completeTask(ctx: Ctx, args: { task_id: string; result_note?: string }) {
  const task = await getOr404<Task>(ctx, "tasks", args.task_id, "This task");
  assert(!["Done", "Cancelled"].includes(task.status), conflict(`This task is already ${task.status.toLowerCase()}.`));
  const allowed =
    ctx.system ||
    ctx.me.is_demo ||
    task.performer_id === ctx.me.user_id ||
    task.responsible_id === ctx.me.user_id ||
    task.created_by === ctx.me.user_id;
  assert(allowed, denied("Only the performer or the responsible person can complete this task."));
  const unmet = await unmetPrerequisites(ctx, task.id);
  assert(!unmet.length, new OpError(`Still waiting for: ${unmet.map((u) => u.title).join(", ")}.`));
  const { count: open } = await ctx.db.from("requests").select("id", { count: "exact", head: true }).eq("task_id", task.id).eq("status", "Open");
  assert(!open, new OpError("This task is blocked by an open request. It can be completed once the request is answered."));
  assert(
    !task.requires_review || task.review_satisfied,
    new OpError("This task needs an accepted review of its document before it can be done. Use Request review on the document."),
  );
  await ctx.db
    .from("tasks")
    .update({
      status: "Done",
      completed_at: now(),
      result_note: args.result_note?.trim() || task.result_note,
      updated_at: now(),
    })
    .eq("id", task.id);
  await log(ctx, {
    verb: "completed",
    summary: `Completed “${task.title}”${args.result_note ? `: ${truncate(args.result_note, 120)}` : ""}`,
    subject_kind: "task",
    subject_id: task.id,
    mission_id: task.mission_id,
  });
  await onTaskDone(ctx, task.id);
  return { ok: true };
}

export async function onTaskDone(ctx: Ctx, taskId: string) {
  const { data: task } = await ctx.db.from("tasks").select("*").eq("id", taskId).single();
  if (task.responsible_id && task.responsible_id !== ctx.me.user_id) {
    await notify(ctx, task.responsible_id, {
      kind: "task_done",
      title: `“${task.title}” is done`,
      link: `/tasks/${task.id}`,
    });
  }
  await reevaluateDependents(ctx, taskId);
}

export async function cancelTask(ctx: Ctx, args: { task_id: string; withdraw_review?: boolean }) {
  const task = await getOr404<Task>(ctx, "tasks", args.task_id, "This task");
  assert(!["Done", "Cancelled"].includes(task.status), conflict(`This task is already ${task.status.toLowerCase()}.`));
  const allowed = ctx.me.is_demo || task.responsible_id === ctx.me.user_id || task.created_by === ctx.me.user_id;
  assert(allowed, denied("Only the responsible person can cancel this task."));
  await ctx.db.from("tasks").update({ status: "Cancelled", updated_at: now() }).eq("id", task.id);
  // Questions and a pending start approval are withdrawn; reviews only by explicit choice.
  await ctx.db
    .from("requests")
    .update({ status: "Withdrawn", updated_at: now() })
    .eq("task_id", task.id)
    .eq("status", "Open")
    .in("type", ["information", "authorization"])
    .is("action_attempt_id", null);
  if (args.withdraw_review && task.review_submission_id) {
    await ctx.db.from("review_submissions").update({ status: "Withdrawn", closed_at: now() }).eq("id", task.review_submission_id).eq("status", "Open");
    await ctx.db.from("requests").update({ status: "Withdrawn", updated_at: now() }).eq("review_submission_id", task.review_submission_id).eq("status", "Open");
  }
  if (task.assignment_id) {
    await ctx.db
      .from("assignments")
      .update({ status: "Ending", condition: "Task cancelled", updated_at: now() })
      .eq("id", task.assignment_id)
      .in("status", ["Active", "Pausing", "Paused"]);
    kick();
  }
  await log(ctx, {
    verb: "cancelled",
    summary: `Cancelled “${task.title}”. Shared documents and earlier effects are unchanged.`,
    subject_kind: "task",
    subject_id: task.id,
    mission_id: task.mission_id,
  });
  return { ok: true };
}

export async function reopenTask(ctx: Ctx, args: { task_id: string }) {
  const task = await getOr404<Task>(ctx, "tasks", args.task_id, "This task");
  assert(["Done", "Cancelled"].includes(task.status), conflict("This task is already open."));
  const allowed = ctx.me.is_demo || task.responsible_id === ctx.me.user_id || task.created_by === ctx.me.user_id;
  assert(allowed, denied("Only the responsible person can reopen this task."));
  await ctx.db.from("tasks").update({ status: "Open", completed_at: null, updated_at: now() }).eq("id", task.id);
  await log(ctx, {
    verb: "reopened",
    summary: `Reopened “${task.title}”. Ended agents are not restarted.`,
    subject_kind: "task",
    subject_id: task.id,
    mission_id: task.mission_id,
  });
  return { ok: true };
}
