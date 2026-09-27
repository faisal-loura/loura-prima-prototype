"use client";

import { useState } from "react";
import { Button, FormGroup, HTMLSelect, InputGroup, Switch } from "@blueprintjs/core";
import { useOp, type ViewData } from "@/lib/api";
import { Eyebrow } from "@/components/ui/layout";
import { ActivityList, Time } from "@/components/ui/content";
import { StatusTag } from "@/components/ui/status";
import { InlineError, ResultNote } from "@/components/ui/common";

type ConnData = ViewData<"connection">;
type FailMode = ConnData["connection"]["fail_mode"];

export const FAIL_MODES: { value: FailMode; label: string }[] = [
  { value: "none", label: "Respond normally" },
  { value: "reject", label: "Reject the update" },
  { value: "lost_response", label: "Apply it but lose the response" },
  { value: "lost_response_no_readback", label: "Apply it, lose the response, and fail readback" },
];

/** Admin-only controls that stand in for the external system. Always visibly separate from Loura's own state. */
export function HarnessPanel({ d }: { d: ConnData }) {
  const c = d.connection;
  const observation = useOp("setObservation", {
    // Runs before the view refetches, so `c` still holds the state before this change.
    success: () => `Harness: observation of ${c.name} ${c.events_available ? "made unavailable" : "restored"}`,
  });
  const failMode = useOp("setFailMode", { success: "Harness: next action behaviour set" });

  return (
    <section aria-labelledby="harness-title" className="rounded-xl border-2 border-dashed border-risk/50 bg-risk-soft/40">
      <div className="border-b border-dashed border-risk/40 px-4 py-3">
        <h2 id="harness-title" className="text-sm font-medium text-risk">
          Sandbox test harness — simulated external events
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Harness actions change the sandbox&apos;s own records. Loura only learns about them through the connection.</p>
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2 rounded-lg border bg-card p-3">
            <Eyebrow>Connection behaviour</Eyebrow>
            <Switch
              checked={c.events_available && c.reads_available}
              disabled={observation.isPending}
              onChange={(e) => observation.mutate({ connection_id: c.id, available: e.currentTarget.checked })}
              labelElement={<span>Observation {c.events_available && c.reads_available ? "available" : "unavailable"}</span>}
            />
            <InlineError error={observation.error} />
            <FormGroup label="Next action behaviour" labelFor="harness-failmode" className="!mb-0">
              <HTMLSelect
                id="harness-failmode"
                fill
                value={c.fail_mode}
                disabled={failMode.isPending}
                onChange={(e) => failMode.mutate({ connection_id: c.id, fail_mode: e.currentTarget.value as FailMode })}
                options={FAIL_MODES}
              />
            </FormGroup>
            <InlineError error={failMode.error} />
          </div>

          <div className="space-y-2">
            <Eyebrow>Records</Eyebrow>
            {d.records.map((r) => (
              <RecordHarness key={r.id} r={r} />
            ))}
          </div>

          {d.events.length > 0 && (
            <div className="space-y-2">
              <Eyebrow>Deliver an earlier event again</Eyebrow>
              <ul className="divide-y rounded-lg border bg-card">
                {d.events.slice(0, 8).map((e) => (
                  <ReplayRow key={e.id} e={e} />
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Eyebrow>Harness log</Eyebrow>
          <div className="rounded-lg border bg-card p-3">
            <ActivityList items={d.harness_log} empty="No harness activity yet." />
          </div>
        </div>
      </div>
    </section>
  );
}

function RecordHarness({ r }: { r: ConnData["records"][number] }) {
  const [date, setDate] = useState("");
  const [eventId, setEventId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const inject = useOp("injectDeliveryDateChange", { silent: true, success: (res) => res.message });

  return (
    <form
      className="space-y-2 rounded-lg border bg-card p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        inject.mutate(
          { record_id: r.id, due_date: date, external_event_id: eventId.trim() || undefined },
          {
            onSuccess: (res) => {
              setMessage(res.message);
              setEventId("");
            },
          },
        );
      }}
    >
      <p className="text-sm">
        <span className="font-mono font-medium">{r.external_id}</span> · due <span className="font-mono">{r.data.due_date}</span>
      </p>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <FormGroup label="New due date" labelFor={`h-date-${r.id}`} className="!mb-0">
          <InputGroup id={`h-date-${r.id}`} type="date" value={date} onChange={(e) => setDate(e.currentTarget.value)} required />
        </FormGroup>
        <FormGroup label="Event id" labelInfo="(optional)" labelFor={`h-evt-${r.id}`} className="!mb-0">
          <InputGroup id={`h-evt-${r.id}`} value={eventId} placeholder={`${r.external_id}-v${r.version + 1}`} onChange={(e) => setEventId(e.currentTarget.value)} />
        </FormGroup>
        <Button type="submit" variant="outlined" text="Change due date" disabled={!date} loading={inject.isPending} />
      </div>
      <InlineError error={inject.error} />
      {message && <ResultNote tone="neutral">{message}</ResultNote>}
    </form>
  );
}

function ReplayRow({ e }: { e: ConnData["events"][number] }) {
  const [message, setMessage] = useState<string | null>(null);
  const replay = useOp("replayEvent", { silent: true, success: (r) => r.message });
  return (
    <li className="space-y-1.5 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono">{e.external_event_id}</span>
          <StatusTag kind="event" value={e.status} />
          <Time iso={e.received_at} className="text-muted-foreground" />
        </span>
        <Button
          size="small"
          variant="outlined"
          icon="duplicate"
          text="Deliver again (duplicate)"
          loading={replay.isPending}
          onClick={() => replay.mutate({ event_id: e.id }, { onSuccess: (r) => setMessage(r.message) })}
        />
      </div>
      <InlineError error={replay.error} />
      {message && <ResultNote tone="neutral">{message}</ResultNote>}
    </li>
  );
}
