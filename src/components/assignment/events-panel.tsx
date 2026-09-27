"use client";

import Link from "next/link";
import { EmptyState, Panel } from "@/components/ui/layout";
import { Time } from "@/components/ui/content";
import { Pill, StatusTag } from "@/components/ui/status";
import type { AssignmentData } from "./header";

export function EventsPanel({ d }: { d: AssignmentData }) {
  if (!d.record) return null;
  const observing = Boolean(d.connection?.events_available);
  return (
    <Panel title="Events" padded={false}>
      {d.events.length ? (
        <ul className="divide-y">
          {d.events.map((e) => {
            const p = e.payload as { field?: string; from?: string; to?: string };
            return (
              <li key={e.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-sm">
                <div className="min-w-0 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">{e.external_event_id}</span>
                    <StatusTag kind="event" value={e.status} />
                    {e.this_assignment && <Pill tone="agent">This assignment</Pill>}
                  </p>
                  {p.from !== undefined && (
                    <p>
                      {p.field === "due_date" ? "Due date" : p.field}: <span className="font-mono">{p.from}</span> → <span className="font-mono">{p.to}</span>
                    </p>
                  )}
                  {e.note && <p className="text-xs text-muted-foreground">{e.note}</p>}
                </div>
                <span className="text-xs text-muted-foreground">
                  Received <Time iso={e.received_at} />
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={observing ? "tick" : "eye-off"}
          title={observing ? "No relevant change" : "Observation unavailable"}
          description={observing ? "No update for this record has been received." : "Loura can't receive updates right now, so changes may be missed."}
        />
      )}
    </Panel>
  );
}

export function RequestsPanel({ d }: { d: AssignmentData }) {
  if (!d.requests.length) return null;
  return (
    <Panel title="Requests" padded={false}>
      <ul className="divide-y">
        {d.requests.map((r) => (
          <li key={r.id} className="space-y-1 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <StatusTag kind="request" value={r.status} />
              <span className="font-mono text-[11px] uppercase tracking-eyebrow text-muted-foreground">{r.type}</span>
            </div>
            <Link href={`/requests/${r.id}`} className="block font-medium hover:underline">
              {r.question}
            </Link>
            <p className="text-xs text-muted-foreground">
              To {r.recipient} · <Time iso={r.created_at} />
            </p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
