import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, assertSupabaseConfigured } from "@/lib/supabase/env";

/** Every query runs against the `loura` schema. Row types live in ./types. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any, "loura", "loura", any, any>;

/**
 * The signed-in person's client. Row-level security in Postgres decides what it
 * can read or write, so a server bug cannot widen access beyond the policies.
 */
export function userDb(): Db {
  assertSupabaseConfigured();
  const cookieStore = cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    db: { schema: "loura" },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Read-only in Server Components; the middleware refreshes the session.
        }
      },
    },
  }) as unknown as Db;
}

/**
 * The Loura system identity. The worker uses it to carry assignments forward
 * while nobody has the page open. It signs in like any member, and its reach is
 * the `is_system` flag checked by the same policies — not a service-role bypass.
 */
let systemClient: Promise<Db> | null = null;
let systemSignedInAt = 0;

export function systemDb(): Promise<Db> {
  const stale = Date.now() - systemSignedInAt > 45 * 60 * 1000;
  if (!systemClient || stale) {
    systemSignedInAt = Date.now();
    systemClient = (async () => {
      const email = process.env.LOURA_SYSTEM_EMAIL;
      const password = process.env.LOURA_SYSTEM_PASSWORD;
      if (!email || !password) throw new Error("LOURA_SYSTEM_EMAIL / LOURA_SYSTEM_PASSWORD are not set");
      const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        db: { schema: "loura" },
        auth: { persistSession: false, autoRefreshToken: true },
      }) as unknown as Db;
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        systemClient = null;
        throw new Error(`Loura system identity could not sign in: ${error.message}`);
      }
      return client;
    })();
  }
  return systemClient;
}

/** Throw on a Supabase error, return data otherwise. */
export function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

export function one<T>(res: { data: T[] | T | null; error: { message: string } | null }, what: string): T | null {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  const d = res.data;
  if (Array.isArray(d)) return (d[0] as T) ?? null;
  return (d as T) ?? null;
}
