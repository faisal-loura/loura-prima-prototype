import "server-only";
import type { Ctx } from "../context";
import type { Agent, Member } from "../types";

export interface Lookup {
  person: (id: string | null | undefined) => string;
  member: (id: string | null | undefined) => Member | undefined;
  agent: (id: string | null | undefined) => string;
}

export async function lookup(ctx: Ctx): Promise<Lookup> {
  const [{ data: ms }, { data: ags }] = await Promise.all([
    ctx.db.from("members").select("*"),
    ctx.db.from("agents").select("id,name"),
  ]);
  const members = new Map(((ms ?? []) as Member[]).map((m) => [m.user_id, m]));
  const agents = new Map(((ags ?? []) as Pick<Agent, "id" | "name">[]).map((a) => [a.id, a.name]));
  return {
    person: (id) => (id ? (members.get(id)?.full_name ?? "Former member") : "—"),
    member: (id) => (id ? members.get(id) : undefined),
    agent: (id) => (id ? (agents.get(id) ?? "Agent") : "Agent"),
  };
}

