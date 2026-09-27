"use client";

import Link from "next/link";
import { Icon } from "@blueprintjs/core";
import type { ViewData } from "@/lib/api";
import { EmptyState, Eyebrow } from "@/components/ui/layout";
import { fmtDateTime, Time } from "@/components/ui/content";
import { Pill } from "@/components/ui/status";
import { FAIL_MODES } from "./harness-panel";

type Connections = ViewData<"connections">;
type Conn = Connections["connections"][number];

export function HealthPill({ c }: { c: Pick<Conn, "events_available" | "reads_available" | "gap_started_at"> }) {
  return c.events_available && c.reads_available ? (
    <Pill tone="ok" icon="eye-open">Observing</Pill>
  ) : (
    <Pill tone="danger" icon="eye-off">
      Observation unavailable{c.gap_started_at ? ` since ${fmtDateTime(c.gap_started_at)}` : ""}
    </Pill>
  );
}

/** Apps Loura has logos for but can't connect to yet in this prototype. */
const APPS = [
  { name: "Gmail", logo: "/gmail.png", description: "Read threads and draft replies from a shared inbox." },
  { name: "Outlook", logo: "/outlook.png", description: "Read mail and calendar events from Microsoft 365." },
  { name: "Slack", logo: "/slack.png", description: "Follow channels and post updates where your team works." },
  { name: "Odoo", logo: "/odoo.png", description: "Read and update records in your Odoo ERP." },
  { name: "Zoho", logo: "/zoho.png", description: "Read and update CRM and finance records in Zoho." },
];

function LogoTile({ src, name }: { src?: string; name: string }) {
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-white p-1.5">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`${name} logo`} className="max-h-full max-w-full object-contain" />
      ) : (
        <Icon icon="data-connection" size={18} className="text-muted-foreground" aria-hidden />
      )}
    </span>
  );
}

export function ConnectionsList({ d }: { d: Connections }) {
  return (
    <div className="space-y-10">
      <section aria-labelledby="connected-heading" className="space-y-3">
        <h2 id="connected-heading" className="text-[15px] text-muted-foreground">
          Connected ({d.connections.length})
        </h2>
        {!d.connections.length ? (
          <EmptyState icon="data-connection" title="No connections yet" />
        ) : (
          <ul className="space-y-2.5">
            {d.connections.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/connections/${c.id}`}
                  className="flex items-start gap-4 rounded-3xl border bg-card p-5 shadow-[0_1px_3px_rgb(28_26_24/0.04)] transition-colors hover:border-input"
                >
                  <LogoTile name={c.name} />
                  <span className="min-w-0 flex-1 space-y-1.5">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[15px] font-medium">{c.name}</span>
                      <HealthPill c={c} />
                    </span>
                    <span className="block text-sm text-muted-foreground">{c.description}</span>
                    <span className="flex flex-wrap gap-1.5 pt-1">
                      {[...c.capabilities.reads.map((x) => `Reads ${x.toLowerCase()}`), ...c.capabilities.events.map((x) => `Event: ${x.toLowerCase()}`), ...c.capabilities.actions].map((x) => (
                        <span key={x} className="rounded-md bg-muted px-1.5 py-0.5 text-[12px] text-muted-foreground">
                          {x}
                        </span>
                      ))}
                    </span>
                    <span className="block pt-0.5 text-xs text-muted-foreground">
                      Last event {c.last_observation_at ? <Time iso={c.last_observation_at} /> : "— none yet"}
                      {d.is_admin && c.fail_mode !== "none" && <> · Harness: {FAIL_MODES.find((f) => f.value === c.fail_mode)?.label ?? c.fail_mode}</>}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="apps-heading" className="space-y-3">
        <h2 id="apps-heading" className="text-[15px] text-muted-foreground">
          Available apps
        </h2>
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {APPS.map((a) => (
            <li key={a.name} className="flex items-start gap-4 rounded-3xl border bg-card p-5">
              <LogoTile src={a.logo} name={a.name} />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[15px] font-medium">{a.name}</p>
                  <button
                    type="button"
                    disabled
                    title="Connecting apps isn't available in this prototype yet"
                    className="h-8 rounded-full border px-3.5 text-[13px] font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Connect
                  </button>
                </div>
                <p className="text-sm text-muted-foreground">{a.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <Link href="/sources" className="flex items-center gap-4 rounded-3xl border bg-card p-5 transition-colors hover:border-input">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-muted">
          <Icon icon="document" size={18} className="text-muted-foreground" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">Sources</span>
          <span className="block text-sm text-muted-foreground">Documents and records that conversations, tasks, and assignments rely on.</span>
        </span>
        <Icon icon="chevron-right" size={14} className="text-muted-foreground" aria-hidden />
      </Link>
    </div>
  );
}

export function Capability({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <ul className="mt-1 space-y-0.5">
        {items.length ? items.map((i) => <li key={i}>{i}</li>) : <li className="text-muted-foreground">None</li>}
      </ul>
    </div>
  );
}
