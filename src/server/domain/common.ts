import "server-only";
import type { Ctx } from "../context";
import { notFound } from "../context";
import type { Member } from "../types";

export const now = () => new Date().toISOString();

export interface LogInput {
  verb: string;
  summary: string;
  subject_kind: string;
  subject_id?: string | null;
  mission_id?: string | null;
  space_id?: string | null;
  assignment_id?: string | null;
  run_id?: string | null;
  agent_id?: string | null;
  control?: boolean;
  data?: Record<string, unknown>;
  /** Override the actor, e.g. a person's decision recorded by the worker. */
  actor_id?: string | null;
}

/** Attributable history. Direct human actions never invent an agent run. */
export async function log(ctx: Ctx, input: LogInput) {
  const actor_kind = input.agent_id ? "agent" : ctx.system && !input.actor_id ? "system" : "person";
  const { error } = await ctx.db.from("activity").insert({
    org_id: ctx.me.org_id,
    actor_kind,
    actor_id: input.actor_id ?? (ctx.system ? null : ctx.me.user_id),
    agent_id: input.agent_id ?? null,
    verb: input.verb,
    summary: input.summary,
    subject_kind: input.subject_kind,
    subject_id: input.subject_id ?? null,
    mission_id: input.mission_id ?? null,
    space_id: input.space_id ?? null,
    assignment_id: input.assignment_id ?? null,
    run_id: input.run_id ?? null,
    control: input.control ?? false,
    data: input.data ?? {},
  });
  if (error) console.error("[loura] activity log failed:", error.message);
}

/** An informational update. Reading or dismissing it never resolves a request. */
export async function notify(
  ctx: Ctx,
  userId: string | null | undefined,
  update: { kind: string; title: string; body?: string; link?: string },
) {
  if (!userId || userId === ctx.me.user_id) return;
  const { error } = await ctx.db.from("updates").insert({
    org_id: ctx.me.org_id,
    user_id: userId,
    kind: update.kind,
    title: update.title,
    body: update.body ?? "",
    link: update.link ?? null,
  });
  if (error) console.error("[loura] update failed:", error.message);
}

export async function members(ctx: Ctx): Promise<Member[]> {
  const { data } = await ctx.db.from("members").select("*").order("full_name");
  return (data ?? []) as Member[];
}

export async function memberMap(ctx: Ctx): Promise<Map<string, Member>> {
  return new Map((await members(ctx)).map((m) => [m.user_id, m]));
}

export async function nameOf(ctx: Ctx, userId: string | null | undefined): Promise<string> {
  if (!userId) return "Someone";
  const { data } = await ctx.db.from("members").select("full_name").eq("user_id", userId).maybeSingle();
  return (data?.full_name as string) ?? "A former member";
}

export const firstName = (full: string) => full.split(" ")[0] ?? full;

/** Fetch one visible row or fail with a safe not-found message (no restricted detail). */
export async function getOr404<T>(ctx: Ctx, table: string, id: string, what: string): Promise<T> {
  if (!id) throw notFound(what);
  const { data, error } = await ctx.db.from(table).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`${table}: ${error.message}`);
  if (!data) throw notFound(what);
  return data as T;
}

export function assert(cond: unknown, err: Error): asserts cond {
  if (!cond) throw err;
}

export const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
