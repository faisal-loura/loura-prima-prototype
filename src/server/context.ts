import "server-only";
import { systemDb, userDb, type Db } from "./db";
import type { Member } from "./types";

/** A failure the person can act on. The message is shown as-is in the UI. */
export class OpError extends Error {
  constructor(
    message: string,
    public status: 400 | 401 | 403 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

export const denied = (why: string) => new OpError(why, 403);
export const notFound = (what = "This record") =>
  new OpError(`${what} doesn't exist or you don't have access to it.`, 404);
export const conflict = (why: string) => new OpError(why, 409);

export interface Ctx {
  db: Db;
  me: Member;
  /** Whether this context is the Loura system identity (the worker). */
  system: boolean;
}

export async function userCtx(): Promise<Ctx> {
  const db = userDb();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new OpError("Your session has ended. Sign in again.", 401);
  const { data: me } = await db.from("members").select("*").eq("user_id", user.id).maybeSingle();
  // An effective organization removal blocks access even through earlier grants.
  if (!me || me.status !== "active") throw new OpError("You no longer have access to this organization.", 403);
  return { db, me: me as Member, system: false };
}

let cachedSystemMember: Member | null = null;

export async function systemCtx(): Promise<Ctx> {
  const db = await systemDb();
  if (!cachedSystemMember) {
    const { data: auth } = await db.auth.getUser();
    const { data } = await db.from("members").select("*").eq("user_id", auth.user?.id ?? "").single();
    cachedSystemMember = data as Member;
  }
  return { db, me: cachedSystemMember, system: true };
}
