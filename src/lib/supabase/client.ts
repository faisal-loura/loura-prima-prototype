"use client";

import { createBrowserClient } from "@supabase/ssr";
import { assertSupabaseConfigured, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

/** One browser client per tab — a second instance would fight over the auth cookie. */
export function createClient() {
  assertSupabaseConfigured();
  browserClient ??= createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  return browserClient;
}
