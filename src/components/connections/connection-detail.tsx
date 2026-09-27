"use client";

import Link from "next/link";
import type { ViewData } from "@/lib/api";
import { EffectNote, EmptyState, Eyebrow, KeyValue, Panel } from "@/components/ui/layout";
import { fmtDateTime, RecordLink, Time } from "@/components/ui/content";
import { StatusTag } from "@/components/ui/status";
import { DataTable, Td, humanize, opLabel } from "@/components/ui/common";
import { Capability, HealthPill } from "./connections";
import { HarnessPanel } from "./harness-panel";

type ConnData = ViewData<"connection">;

export function ConnectionDetail({ d }: { d: ConnData }) {
  const c = d.connection;
  const observing = c.events_available && c.reads_available;
  const recordLabel = (id: string | null) => d.records.find((r) => r.id === id)?.external_id;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Capabilities">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <Capability label="Reads" items={c.capabilities.reads} />
            <Capability label="Events" items={c.capabilities.events} />
            <Capability label="Actions" items={c.capabilities.actions} />
          </div>
        </Panel>
        <Panel title="Health" actions={<HealthPill c={c} />}>
          <div className="space-y-3">
            <KeyValue
              items={[
                { label: "Reads", value: c.reads_available ? "Available" : "Unavailable" },
                { label: "Events", value: c.events_available ? "Available" : "Unavailable" },
                { label: "Gap started", value: c.gap_started_at ? fmtDateTime(c.gap_started_at) : "—" },
                {
                  label: "Last gap",
                  value: c.last_gap?.from ? `${fmtDateTime(c.last_gap.from)} → ${c.last_gap.to ? fmtDateTime(c.last_gap.to) : "ongoing"}` : "—",
                },
                { label: "Last event", value: c.last_observation_at ? <Time iso={c.last_observation_at} /> : "None yet" },
              ]}
            />
            {observing ? (
              <EffectNote>Observing. When nothing arrives, there has been no relevant change that the connection reported.</EffectNote>
            ) : (
              <EffectNote tone="warn">Observation unavailable. No updates doesn&apos;t mean no changes — events during this gap can&apos;t be recovered.</EffectNote>
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Records" padded={false}>
        {d.records.length ? (
          <DataTable head={["Record", "Item", "Quantity", "Due date", "Risk flag", "Version", "Updated"]}>
            {d.records.map((r) => (
              <tr key={r.id}>
                <Td className="min-w-[200px]">
                  <span className="font-mono font-medium">{r.external_id}</span>
                  <p className="text-xs text-muted-foreground">{r.label}</p>
                </Td>
                <Td className="text-xs">{r.data.item}</Td>
                <Td className="tabular text-xs">{r.data.quantity}</Td>
                <Td className="whitespace-nowrap font-mono text-xs">{r.data.due_date}</Td>
                <Td className="whitespace-nowrap text-xs">{r.data.risk_flag}</Td>
                <Td className="tabular text-xs">{r.version}</Td>
                <Td className="whitespace-nowrap text-xs text-muted-foreground">
                  <Time iso={r.updated_at} />
                </Td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState icon="th" title="No records" />
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Assignments following it" padded={false}>
          {d.assignments.length ? (
            <ul className="divide-y">
              {d.assignments.map((a) => (
                <li key={a.id} className="space-y-1 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <RecordLink href={`/assignments/${a.id}`}>{a.purpose}</RecordLink>
                    <StatusTag kind="assignment" value={a.status} />
                  </div>
                  <p className="text-xs">{a.condition}</p>
                  <p className="text-xs text-muted-foreground">
                    {recordLabel(a.watch_record_id) ?? "Record"} · {a.responsible} responsible
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="dashboard" title="No assignments you can see follow it" />
          )}
        </Panel>

        <Panel title="Recent events" padded={false}>
          {d.events.length ? (
            <ul className="divide-y">
              {d.events.map((e) => {
                const p = e.payload as { field?: string; from?: string; to?: string };
                return (
                  <li key={e.id} className="space-y-0.5 px-4 py-2.5 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs">{e.external_event_id}</span>
                        <StatusTag kind="event" value={e.status} />
                      </span>
                      <Time iso={e.received_at} className="text-xs text-muted-foreground" />
                    </div>
                    <p className="text-xs">
                      {recordLabel(e.record_id)}{" "}
                      {p.from !== undefined ? (
                        <>
                          {p.field === "due_date" ? "due date" : p.field} <span className="font-mono">{p.from}</span> → <span className="font-mono">{p.to}</span>
                        </>
                      ) : (
                        humanize(e.kind)
                      )}
                      {e.injected && <span className="text-muted-foreground"> · test harness</span>}
                    </p>
                    {e.note && <p className="text-xs text-muted-foreground">{e.note}</p>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon="feed" title="No events received" description={observing ? "No relevant change has been reported." : "Observation is unavailable."} />
          )}
        </Panel>
      </div>

      <Panel title="Recent action attempts" padded={false}>
        {d.attempts.length ? (
          <ul className="divide-y">
            {d.attempts.map((x) => (
              <li key={x.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-sm">
                <div className="min-w-0 space-y-0.5">
                  <p>
                    {opLabel(x.operation)} · <span className="text-muted-foreground">{x.target_label}</span>
                  </p>
                  <p className="text-xs">
                    {humanize(x.field)}: {x.current_value ?? "—"} → {x.proposed_value}
                  </p>
                  {x.assignment_id && (
                    <Link href={`/assignments/${x.assignment_id}`} className="text-xs hover:underline">
                      Open assignment
                    </Link>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusTag kind="action" value={x.status === "AwaitingAuthorization" && x.decided_at ? "Approved" : x.status} />
                  <Time iso={x.updated_at} className="text-xs text-muted-foreground" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="send-to" title="No action attempts" />
        )}
      </Panel>

      {d.is_admin && <HarnessPanel d={d} />}
      {!d.is_admin && (
        <div>
          <Eyebrow>Test harness</Eyebrow>
          <p className="mt-1 text-xs text-muted-foreground">Only administrators can simulate external events for this sandbox.</p>
        </div>
      )}
    </div>
  );
}
