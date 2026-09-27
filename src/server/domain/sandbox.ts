import "server-only";
import { conflict, denied, OpError, systemCtx, type Ctx } from "../context";
import { kick } from "../kick";
import type { ActionAttempt, ActionRule, Assignment, Connection, FailMode, SandboxRecord, SourceEvent } from "../types";
import { assert, getOr404, log, notify, now } from "./common";
import { queueRun } from "./assignments";

/*
 * The sandbox stands in for an external application (brief §6: "Real-world
 * external effects replaced by a sandbox record update with controllable success
 * or failure"). Events are injected by a test harness and always marked as such.
 */

function requireHarness(ctx: Ctx) {
  assert(ctx.me.is_admin || ctx.system, denied("Only an administrator can operate the sandbox test harness."));
}

/** Harness: the external system changes a delivery date, and — if observation works — tells Loura. */
export async function injectDeliveryDateChange(
  ctx: Ctx,
  args: { record_id: string; due_date: string; external_event_id?: string },
) {
  requireHarness(ctx);
  const sys = await systemCtx();
  const rec = await getOr404<SandboxRecord>(sys, "sandbox_records", args.record_id, "This record");
  const conn = await getOr404<Connection>(sys, "connections", rec.connection_id, "This connection");
  assert(/^\d{4}-\d{2}-\d{2}$/.test(args.due_date), new OpError("Use a date like 2026-09-21."));

  // The external application's own record changes regardless of what Loura observes.
  const previous = rec.data.due_date;
  const version = rec.version + 1;
  await sys.db
    .from("sandbox_records")
    .update({ data: { ...rec.data, due_date: args.due_date }, version, updated_at: now() })
    .eq("id", rec.id);

  const externalEventId = args.external_event_id?.trim() || `${rec.external_id}-v${version}`;
  const occurredAt = now();

  if (!conn.events_available) {
    const missed = [...(conn.last_gap?.missed_event_ids ?? []), externalEventId];
    await sys.db
      .from("connections")
      .update({ last_gap: { from: conn.gap_started_at, to: null, missed_event_ids: missed }, updated_at: now() })
      .eq("id", conn.id);
    await log(ctx, {
      verb: "harness_change",
      summary: `Harness changed ${rec.external_id} due date ${previous} → ${args.due_date}. Not delivered: observation is unavailable.`,
      subject_kind: "connection",
      subject_id: conn.id,
    });
    return { delivered: false, message: "The sandbox record changed, but Loura didn't receive the event — observation is unavailable." };
  }

  return deliverEvent(sys, ctx, conn, rec, {
    external_event_id: externalEventId,
    kind: "delivery_date_changed",
    payload: { field: "due_date", from: previous, to: args.due_date, record_version: version },
    occurred_at: occurredAt,
  });
}

/** Harness: deliver the same source event again (same identity). */
export async function replayEvent(ctx: Ctx, args: { event_id: string }) {
  requireHarness(ctx);
  const sys = await systemCtx();
  const ev = await getOr404<SourceEvent>(sys, "source_events", args.event_id, "This event");
  const conn = await getOr404<Connection>(sys, "connections", ev.connection_id, "This connection");
  const rec = ev.record_id ? await getOr404<SandboxRecord>(sys, "sandbox_records", ev.record_id, "This record") : null;
  assert(rec, new OpError("That event has no record."));
  assert(conn.events_available, new OpError("Observation is unavailable, so a replayed event wouldn't be received."));
  return deliverEvent(sys, ctx, conn, rec, {
    external_event_id: ev.external_event_id,
    kind: ev.kind,
    payload: ev.payload,
    occurred_at: ev.occurred_at,
  });
}

async function deliverEvent(
  sys: Ctx,
  harnessCtx: Ctx,
  conn: Connection,
  rec: SandboxRecord,
  ev: { external_event_id: string; kind: string; payload: Record<string, unknown>; occurred_at: string },
) {
  // Event identity is enforced by a unique constraint: a duplicate cannot create new obligations.
  const ins = await sys.db
    .from("source_events")
    .insert({
      org_id: conn.org_id,
      connection_id: conn.id,
      external_event_id: ev.external_event_id,
      record_id: rec.id,
      kind: ev.kind,
      payload: ev.payload,
      occurred_at: ev.occurred_at,
      injected: true,
    })
    .select()
    .single();

  if (ins.error) {
    if (ins.error.code !== "23505") throw new Error(ins.error.message);
    const { data: original } = await sys.db
      .from("source_events")
      .select("*")
      .eq("connection_id", conn.id)
      .eq("external_event_id", ev.external_event_id)
      .single();
    await log(sys, {
      verb: "duplicate_event",
      summary: `Duplicate of event ${ev.external_event_id} (first received ${new Date(original.received_at).toLocaleString("en-GB")}). Ignored: no new run, request, or action.`,
      subject_kind: "connection",
      subject_id: conn.id,
    });
    return { delivered: true, duplicate: true, message: `Duplicate event ${ev.external_event_id} recognised and ignored.` };
  }

  await sys.db.from("connections").update({ last_observation_at: now() }).eq("id", conn.id);

  const { data: watchers } = await sys.db
    .from("assignments")
    .select("*")
    .eq("watch_record_id", rec.id)
    .in("status", ["Active", "Pausing", "Paused"]);
  const list = (watchers ?? []) as Assignment[];
  const active = list.filter((a) => a.status === "Active");
  const held = list.filter((a) => a.status !== "Active");

  const status = active.length ? "Matched" : held.length ? "Held" : "Irrelevant";
  await sys.db
    .from("source_events")
    .update({
      status,
      assignment_ids: list.map((a) => a.id),
      note: held.length
        ? "Received while the assignment's actions were paused. It will be considered on resume."
        : active.length
          ? ""
          : "No active assignment follows this record.",
    })
    .eq("id", ins.data.id);

  for (const a of active) {
    await queueRun(sys, a.id, "event", `Delivery date changed ${ev.payload.from} → ${ev.payload.to}`, { event_id: ins.data.id });
  }
  for (const a of held) {
    await log(sys, {
      verb: "event_held",
      summary: `Update received while paused: ${rec.external_id} due date ${ev.payload.from} → ${ev.payload.to}. No action taken.`,
      subject_kind: "assignment",
      subject_id: a.id,
      assignment_id: a.id,
    });
  }
  await log(harnessCtx, {
    verb: "harness_event",
    summary: `Injected test event ${ev.external_event_id}: ${rec.external_id} ${ev.payload.field} ${ev.payload.from} → ${ev.payload.to} (${status.toLowerCase()})`,
    subject_kind: "connection",
    subject_id: conn.id,
  });
  return { delivered: true, duplicate: false, status, message: `Event delivered (${status.toLowerCase()}).` };
}

/** Harness: lose or restore observation. Restoration doesn't invent the missed history. */
export async function setObservation(ctx: Ctx, args: { connection_id: string; available: boolean }) {
  requireHarness(ctx);
  const sys = await systemCtx();
  const conn = await getOr404<Connection>(sys, "connections", args.connection_id, "This connection");
  if (conn.events_available === args.available && conn.reads_available === args.available) return { ok: true };

  const { data: watchers } = await sys.db
    .from("assignments")
    .select("*")
    .eq("connection_id", conn.id)
    .in("status", ["Active", "Pausing", "Paused"]);

  if (!args.available) {
    await sys.db
      .from("connections")
      .update({
        events_available: false,
        reads_available: false,
        gap_started_at: now(),
        last_gap: { from: now(), to: null, missed_event_ids: [] },
        updated_at: now(),
      })
      .eq("id", conn.id);
    await log(ctx, {
      verb: "observation_lost",
      summary: `${conn.name}: reads and events unavailable (harness). This is not the same as “no changes”.`,
      subject_kind: "connection",
      subject_id: conn.id,
      control: true,
    });
    for (const a of (watchers ?? []) as Assignment[]) {
      await sys.db
        .from("assignments")
        .update({ condition: `Observation unavailable since ${new Date().toLocaleString("en-GB")}`, updated_at: now() })
        .eq("id", a.id);
      await notify(sys, a.responsible_id, {
        kind: "observation_gap",
        title: "Loura can't observe a record your assignment follows",
        body: `${conn.name} is unavailable. Changes during this gap may be missed.`,
        link: `/assignments/${a.id}`,
      });
    }
  } else {
    const gap = { from: conn.gap_started_at, to: now(), missed_event_ids: conn.last_gap?.missed_event_ids ?? [] };
    await sys.db
      .from("connections")
      .update({ events_available: true, reads_available: true, gap_started_at: null, last_gap: gap, updated_at: now() })
      .eq("id", conn.id);
    await log(ctx, {
      verb: "observation_restored",
      summary: `${conn.name}: restored. Events during the gap are not recoverable from this sandbox; current state will be re-read.`,
      subject_kind: "connection",
      subject_id: conn.id,
      control: true,
    });
    for (const a of (watchers ?? []) as Assignment[]) {
      await sys.db
        .from("assignments")
        .update({ condition: "Observation restored — reconciling current state", updated_at: now() })
        .eq("id", a.id);
      if (a.status === "Active") await queueRun(sys, a.id, "reconcile", "Re-read current state after an observation gap", { gap });
    }
  }
  return { ok: true };
}

export async function setFailMode(ctx: Ctx, args: { connection_id: string; fail_mode: FailMode }) {
  requireHarness(ctx);
  const conn = await getOr404<Connection>(ctx, "connections", args.connection_id, "This connection");
  await ctx.db.from("connections").update({ fail_mode: args.fail_mode, updated_at: now() }).eq("id", conn.id);
  await log(ctx, {
    verb: "harness_fail_mode",
    summary: `Sandbox action behaviour set to “${args.fail_mode}” (harness)`,
    subject_kind: "connection",
    subject_id: conn.id,
    control: true,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Proposals, dispatch, evidence
// ---------------------------------------------------------------------------

export async function effectiveRule(ctx: Ctx, operation: string): Promise<ActionRule | null> {
  const { data } = await ctx.db.from("action_rules").select("*").eq("operation", operation).maybeSingle();
  return (data as ActionRule) ?? null;
}

/** Called by the worker for approved (or rule-allowed) attempts. */
export async function dispatchAttempt(sys: Ctx, attempt: ActionAttempt) {
  // Claim first. Only one worker pass may check and dispatch a given attempt.
  const claim = await sys.db
    .from("action_attempts")
    .update({ claimed_at: now() })
    .eq("id", attempt.id)
    .eq("status", "AwaitingAuthorization")
    .is("claimed_at", null)
    .select("id");
  if (!claim.data?.length) return;
  const release = () => sys.db.from("action_attempts").update({ claimed_at: null }).eq("id", attempt.id);

  const a = attempt.assignment_id
    ? ((await sys.db.from("assignments").select("*").eq("id", attempt.assignment_id).single()).data as Assignment)
    : null;

  const record = await getOr404<SandboxRecord>(sys, "sandbox_records", attempt.target_record_id ?? "", "The target record");
  const conn = await getOr404<Connection>(sys, "connections", record.connection_id, "This connection");
  const rule = await effectiveRule(sys, attempt.operation);

  const evidence = async (kind: string, establishes: string, observed: Record<string, unknown> = {}) =>
    sys.db.from("action_evidence").insert({ attempt_id: attempt.id, kind, establishes, observed });
  const setStatus = async (status: string, extra: Record<string, unknown> = {}) =>
    sys.db.from("action_attempts").update({ status, updated_at: now(), ...extra }).eq("id", attempt.id);

  // 1. Stop boundary: no dispatch while the assignment's actions are paused or ending.
  if (a && (a.status === "Pausing" || a.status === "Paused")) {
    await release(); // held; resume supersedes it
    return;
  }
  if (a && (a.status === "Ending" || a.status === "Ended")) {
    await setStatus("Superseded", { reason: `${attempt.reason} — assignment ended before dispatch` });
    return;
  }

  // 2. Recheck current authority. An old approval doesn't survive a changed rule.
  if (!rule || rule.rule === "denied") {
    await evidence("recheck", "Not dispatched: the current rule does not permit this operation.", { rule: rule?.rule ?? null });
    await setStatus("Blocked");
    return finishNotice(sys, a, attempt, "Blocked by current rule", "The rule changed after approval, so nothing was sent.");
  }
  if (rule.rule === "approval" && attempt.decided_by !== rule.approver_id) {
    await evidence("recheck", "Not dispatched: the approver no longer holds authority for this operation.", {
      approver_id: rule.approver_id,
    });
    await setStatus("Blocked");
    return finishNotice(sys, a, attempt, "Blocked: approval no longer valid", "The approver changed, so a new decision is needed.");
  }

  // 3. Recheck prerequisites against the current external state.
  if (!conn.reads_available) {
    await release(); // can't recheck safely; stays pending until observation returns
    return;
  }
  const current = String(record.data[attempt.field] ?? "");
  if (current === attempt.proposed_value) {
    await evidence("recheck", `Not dispatched: the target already shows ${attempt.field} = ${current}. No write was needed.`, {
      record_version: record.version,
    });
    await setStatus("StateConfirmed", { dispatched_at: null });
    return finishNotice(sys, a, attempt, "Already in the intended state", "No update was sent.");
  }
  const basis = attempt.evidence as { need_date?: string; due_date?: string };
  if (basis.need_date && record.data.due_date <= basis.need_date) {
    await evidence("recheck", `Not dispatched: the delivery is now due ${record.data.due_date}, on time for ${basis.need_date}. The proposal no longer applies.`);
    await setStatus("Superseded");
    return finishNotice(sys, a, attempt, "Proposal no longer applies", "The situation changed before dispatch.");
  }
  await evidence("recheck", "Checks passed: authority and prerequisites still hold.", {
    rule: rule.rule,
    record_version: record.version,
    current_value: current,
  });

  // 4. Dispatch, then establish the result only from evidence.
  await setStatus("Dispatched", { dispatched_at: now() });
  const mode = conn.fail_mode;
  if (mode === "reject") {
    await evidence("rejection", "The sandbox rejected the update. The record was not changed.", { error: "409 record locked (sandbox)" });
    await setStatus("Failed");
    return finishNotice(sys, a, attempt, "Action failed", "The sandbox rejected the update.");
  }

  const newVersion = record.version + 1;
  await sys.db
    .from("sandbox_records")
    .update({ data: { ...record.data, [attempt.field]: attempt.proposed_value }, version: newVersion, updated_at: now() })
    .eq("id", record.id);

  if (mode === "lost_response" || mode === "lost_response_no_readback") {
    await evidence("timeout", "No response within the timeout. Whether the update took effect is unknown.", { waited_ms: 8000 });
    await setStatus("Uncertain");
    return finishNotice(
      sys,
      a,
      attempt,
      "Action outcome uncertain",
      "The update was sent but no confirmation came back. It won't be repeated without checking.",
    );
  }

  await evidence("response", `The sandbox confirmed the update (record version ${newVersion}).`, {
    status: 200,
    record_version: newVersion,
  });
  await setStatus("Confirmed");
  return finishNotice(sys, a, attempt, "Action confirmed", `${attempt.target_label}: ${attempt.field} is now ${attempt.proposed_value}.`);
}

async function finishNotice(sys: Ctx, a: Assignment | null, attempt: ActionAttempt, title: string, body: string) {
  await log(sys, {
    verb: "action_result",
    summary: `${title}: ${attempt.target_label} ${attempt.field} → ${attempt.proposed_value}. ${body}`,
    subject_kind: "action",
    subject_id: attempt.id,
    assignment_id: a?.id,
    mission_id: a?.mission_id,
  });
  if (a) {
    await notify(sys, a.responsible_id, { kind: "action_result", title, body, link: `/assignments/${a.id}` });
    if (attempt.decided_by && attempt.decided_by !== a.responsible_id) {
      await notify(sys, attempt.decided_by, { kind: "action_result", title, body, link: `/requests/${attempt.request_id}` });
    }
  }
  kick();
}

/**
 * Check an uncertain result by reading the target. A matching value establishes
 * the target's state — not that this attempt caused it. Nothing is re-sent.
 */
export async function readback(ctx: Ctx, attemptId: string) {
  const attempt = await getOr404<ActionAttempt>(ctx, "action_attempts", attemptId, "This action");
  assert(attempt.status === "Uncertain", conflict("Only an uncertain result needs a check."));
  const sys = await systemCtx();
  const record = await getOr404<SandboxRecord>(sys, "sandbox_records", attempt.target_record_id ?? "", "The target record");
  const conn = await getOr404<Connection>(sys, "connections", record.connection_id, "This connection");

  const add = (kind: string, establishes: string, observed: Record<string, unknown> = {}) =>
    sys.db.from("action_evidence").insert({ attempt_id: attempt.id, kind, establishes, observed, created_by: ctx.me.user_id });

  if (!conn.reads_available || conn.fail_mode === "lost_response_no_readback") {
    await add("readback_unavailable", "Readback failed: the record couldn't be read. The outcome is still unresolved.");
    await log(ctx, {
      verb: "checked_action",
      summary: `Checked ${attempt.target_label}: readback unavailable. Outcome still uncertain; not repeated.`,
      subject_kind: "action",
      subject_id: attempt.id,
      assignment_id: attempt.assignment_id,
    });
    return { status: "Uncertain", message: "Readback unavailable. The outcome remains uncertain and the update was not repeated." };
  }

  const value = String(record.data[attempt.field] ?? "");
  if (value === attempt.proposed_value) {
    await add(
      "readback",
      `Readback shows ${attempt.field} = ${value} (record version ${record.version}). This establishes the target's current state. The lost response means it doesn't establish that this attempt made the change.`,
      { value, record_version: record.version },
    );
    await sys.db.from("action_attempts").update({ status: "StateConfirmed", updated_at: now() }).eq("id", attempt.id);
    await log(ctx, {
      verb: "checked_action",
      summary: `Checked ${attempt.target_label}: ${attempt.field} is ${value}. State confirmed; cause not established. Not repeated.`,
      subject_kind: "action",
      subject_id: attempt.id,
      assignment_id: attempt.assignment_id,
    });
    return { status: "StateConfirmed", message: "The target now has the intended value. Nothing was re-sent." };
  }

  await add("readback", `Readback shows ${attempt.field} = ${value}. The update did not take effect.`, {
    value,
    record_version: record.version,
  });
  await sys.db.from("action_attempts").update({ status: "Failed", updated_at: now() }).eq("id", attempt.id);
  await log(ctx, {
    verb: "checked_action",
    summary: `Checked ${attempt.target_label}: ${attempt.field} is still ${value}. The update did not take effect.`,
    subject_kind: "action",
    subject_id: attempt.id,
    assignment_id: attempt.assignment_id,
  });
  return { status: "Failed", message: "The update did not take effect. A new decision is needed to try again." };
}
