"use client";

import Link from "next/link";
import { EffectNote, Eyebrow, KeyValue, Panel } from "@/components/ui/layout";
import { fmtDateTime, Time } from "@/components/ui/content";
import { Pill } from "@/components/ui/status";
import type { AssignmentData } from "./header";

export function ObservationPanel({ d }: { d: AssignmentData }) {
  const { record, connection } = d;
  if (!record && !connection) return null;
  const observing = Boolean(connection?.events_available && connection?.reads_available);
  const relevantEvents = d.events.filter((e) => e.this_assignment);

  return (
    <Panel title="Observation">
      <div className="space-y-4 text-sm">
        {record && (
          <div className="space-y-2">
            <p>
              <span className="font-mono font-medium">{record.external_id}</span> · {record.label}
            </p>
            <KeyValue
              items={[
                { label: "Due date", value: <span className="font-mono">{record.data.due_date}</span> },
                { label: "Quantity", value: <span className="tabular">{record.data.quantity}</span> },
                { label: "Risk flag", value: record.data.risk_flag },
                { label: "Supplier", value: record.data.supplier },
                {
                  label: "Version",
                  value: (
                    <span>
                      {record.version} <span className="text-xs text-muted-foreground">· updated <Time iso={record.updated_at} /></span>
                    </span>
                  ),
                },
              ]}
            />
          </div>
        )}

        {connection && (
          <div className="space-y-2 border-t pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/connections/${connection.id}`} className="font-medium hover:underline">
                {connection.name}
              </Link>
              {observing ? (
                <Pill tone="ok" icon="eye-open">Observing</Pill>
              ) : (
                <Pill tone="danger" icon="eye-off">Observation unavailable</Pill>
              )}
            </div>

            {observing ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Last event received {connection.last_observation_at ? <Time iso={connection.last_observation_at} /> : "— none yet"}.
                </p>
                <EffectNote>
                  {relevantEvents.length
                    ? "Loura is receiving updates. Changes that matter to this assignment appear under Events."
                    : "No relevant change so far. Loura is receiving updates for this record."}
                </EffectNote>
              </>
            ) : (
              <EffectNote tone="warn">
                Observation unavailable{connection.gap_started_at ? ` since ${fmtDateTime(connection.gap_started_at)}` : ""}. A lack of updates here
                doesn&apos;t mean nothing changed.
              </EffectNote>
            )}

            {connection.last_gap?.from && (
              <div className="rounded-md border border-dashed p-2 text-xs">
                <Eyebrow>{connection.last_gap.to ? "Last gap" : "Current gap"}</Eyebrow>
                <p className="mt-1">
                  {fmtDateTime(connection.last_gap.from)} → {connection.last_gap.to ? fmtDateTime(connection.last_gap.to) : "ongoing"}
                </p>
                <p className="mt-0.5 text-muted-foreground">Events during this gap can&apos;t be recovered. Loura re-reads the current record instead.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
