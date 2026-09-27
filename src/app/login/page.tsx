"use client";

import Image from "next/image";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Callout, FormGroup, InputGroup } from "@blueprintjs/core";
import { createClient } from "@/lib/supabase/client";
import { Eyebrow } from "@/components/ui/layout";

const ACCOUNTS = [
  { email: "faisal@loura.test", name: "Faisal Almalki", role: "Demo account — every role, sees every department's decisions" },
  { email: "sam@loura.test", name: "Sam Haddad", role: "Production planning — asks the agent for work and approves tasks" },
  { email: "noura@loura.test", name: "Noura Saleh", role: "Procurement buyer — answers supplier questions" },
  { email: "lina@loura.test", name: "Lina Farouk", role: "Finance controller — reviews documents, approves supplier record changes" },
  { email: "maya@loura.test", name: "Maya Idris", role: "Platform administrator" },
  { email: "omar@loura.test", name: "Omar Nasser", role: "Commercial & sales — answers contract questions" },
];

const PASSWORD = "loura-prototype-2026";

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e?: React.FormEvent, as?: string) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await createClient().auth.signInWithPassword({
      email: as ?? email,
      password: as ? PASSWORD : password,
    });
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    // A full navigation so the server layout reads the new session.
    window.location.href = params.get("next") || "/";
  }

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1fr_1.1fr]">
      <div className="hidden flex-col justify-between border-r bg-surface p-10 lg:flex">
        <div className="flex items-center gap-3">
          <Image src="/Loura%20Symbol.png" alt="" width={34} height={34} unoptimized className="rounded-md" />
          <span className="text-xl font-medium tracking-tight">Loura</span>
        </div>
        <div className="max-w-md space-y-4">
          <h1 className="font-display text-5xl leading-[1.05]">
            Ask. Approve. <em className="text-brand">Get it done.</em>
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            A controlled prototype. The organization, people, proposals, deliveries, and the supplier connection are fictional test fixtures.
            External events come from a visible test harness.
          </p>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-eyebrow text-muted-foreground">Prima International · Platform prototype</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-8">
          <form onSubmit={signIn} className="space-y-4">
            <div>
              <Eyebrow>Sign in</Eyebrow>
              <h2 className="mt-1 font-display text-4xl">Welcome back</h2>
            </div>
            {error && <Callout intent="danger">{error}</Callout>}
            <FormGroup label="Email" labelFor="email">
              <InputGroup id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} required />
            </FormGroup>
            <FormGroup label="Password" labelFor="password">
              <InputGroup id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.currentTarget.value)} required />
            </FormGroup>
            <Button type="submit" intent="primary" fill loading={busy} text="Sign in" />
          </form>

          <div className="space-y-3">
            <div>
              <Eyebrow>Test accounts</Eyebrow>
              <p className="mt-1 text-xs text-muted-foreground">
                Each has only the permissions its role needs. Password: <code className="font-mono">{PASSWORD}</code>
              </p>
            </div>
            <ul className="divide-y rounded-xl border bg-card">
              {ACCOUNTS.map((a) => (
                <li key={a.email}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => signIn(undefined, a.email)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{a.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{a.role}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">Sign in →</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
