import "server-only";
import { denied, OpError, systemCtx, type Ctx } from "../context";
import { kick } from "../kick";
import type { ActionRule, Member } from "../types";
import { assert, log, nameOf, now } from "./common";
import { seedFixtures } from "../seed";

function requireAdmin(ctx: Ctx) {
  assert(ctx.me.is_admin, denied("Only an administrator can change organization controls."));
}

export async function setMemberCapabilities(
  ctx: Ctx,
  args: { user_id: string; is_admin: boolean; is_creator: boolean; is_supervisor: boolean },
) {
  requireAdmin(ctx);
  const { data: before } = await ctx.db.from("members").select("*").eq("user_id", args.user_id).maybeSingle();
  assert(before && !before.is_system, new OpError("That member can't be changed here."));
  assert(
    !(args.user_id === ctx.me.user_id && !args.is_admin),
    new OpError("You can't remove your own administrator access."),
  );
  const { data, error } = await ctx.db
    .from("members")
    .update({ is_admin: args.is_admin, is_creator: args.is_creator, is_supervisor: args.is_supervisor, updated_at: now() })
    .eq("user_id", args.user_id)
    .select();
  if (error || !data?.length) throw new OpError("The change wasn't applied. Existing permissions are unchanged.");
  const m = before as Member;
  const diff = (["is_admin", "is_creator", "is_supervisor"] as const)
    .filter((k) => m[k] !== args[k])
    .map((k) => `${k.replace("is_", "")} ${args[k] ? "granted" : "removed"}`);
  await log(ctx, {
    verb: "changed_permissions",
    summary: `${m.full_name}: ${diff.join(", ") || "no change"}. Effective immediately for new operations.`,
    subject_kind: "member",
    subject_id: args.user_id,
    control: true,
  });
  return { status: "effective" };
}

/**
 * Removing organization membership blocks all access once effective, including
 * earlier individual grants. It doesn't reassign work or cancel external effects.
 */
export async function setMembership(ctx: Ctx, args: { user_id: string; active: boolean }) {
  requireAdmin(ctx);
  assert(args.user_id !== ctx.me.user_id, new OpError("You can't remove yourself."));
  const { data: target } = await ctx.db.from("members").select("*").eq("user_id", args.user_id).maybeSingle();
  assert(target && !target.is_system, new OpError("That member can't be changed here."));
  await ctx.db
    .from("members")
    .update({ status: args.active ? "active" : "removed", updated_at: now() })
    .eq("user_id", args.user_id);

  let paused = 0;
  if (!args.active) {
    // Assignments whose responsible person is gone pause until someone authorized takes over.
    const sys = await systemCtx();
    const { data: asg } = await sys.db
      .from("assignments")
      .select("id")
      .eq("responsible_id", args.user_id)
      .eq("status", "Active");
    for (const a of asg ?? []) {
      await sys.db
        .from("assignments")
        .update({ status: "Pausing", condition: "Responsible person no longer has access — pausing", updated_at: now() })
        .eq("id", a.id);
      paused++;
    }
    kick();
  }
  await log(ctx, {
    verb: args.active ? "restored_member" : "removed_member",
    summary: args.active
      ? `Restored ${target.full_name}'s organization access`
      : `Removed ${target.full_name} from the organization. Their pending requests stay unresolved; ${paused} assignment(s) they were responsible for are pausing. Nothing was reassigned.`,
    subject_kind: "member",
    subject_id: args.user_id,
    control: true,
  });
  return { status: "effective", paused };
}

export async function setActionRule(
  ctx: Ctx,
  args: { operation: string; rule: ActionRule["rule"]; approver_id: string | null },
) {
  requireAdmin(ctx);
  assert(args.rule !== "approval" || args.approver_id, new OpError("Choose who can approve this operation."));
  const { data: before } = await ctx.db.from("action_rules").select("*").eq("operation", args.operation).maybeSingle();
  const { error } = await ctx.db.from("action_rules").upsert(
    {
      org_id: ctx.me.org_id,
      operation: args.operation,
      rule: args.rule,
      approver_id: args.rule === "approval" ? args.approver_id : null,
      updated_by: ctx.me.user_id,
      updated_at: now(),
    },
    { onConflict: "org_id,operation" },
  );
  if (error) throw new OpError(`The rule wasn't changed: ${error.message}`);
  const describe = async (r: { rule: string; approver_id: string | null } | null) =>
    !r ? "no rule" : r.rule === "approval" ? `approval by ${await nameOf(ctx, r.approver_id)}` : r.rule;
  await log(ctx, {
    verb: "changed_rule",
    summary: `${args.operation}: ${await describe(before)} → ${await describe(args)}. Effective for every check from now on; decisions already made are rechecked before dispatch.`,
    subject_kind: "rule",
    control: true,
  });
  return { status: "effective" };
}

export async function resetFixtures(ctx: Ctx, _args?: Record<string, never>) {
  void _args;
  requireAdmin(ctx);
  const { error } = await ctx.db.rpc("wipe_fixture_data");
  if (error) throw new OpError(error.message);
  const sys = await systemCtx();
  await seedFixtures(sys);
  await log(ctx, { verb: "reset", summary: "Reset all prototype fixtures to their starting state", subject_kind: "org", control: true });
  return { ok: true };
}
