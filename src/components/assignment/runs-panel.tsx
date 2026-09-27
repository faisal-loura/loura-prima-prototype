"use client";

import { useState } from "react";
import { Button, Collapse } from "@blueprintjs/core";
import { EmptyState, Eyebrow, Panel } from "@/components/ui/layout";
import { fmtDateTime, Time } from "@/components/ui/content";
import { SimulatedTag, StatusTag } from "@/components/ui/status";
import { humanize } from "@/components/ui/common";
import type { AssignmentData } from "./header";

type Run = AssignmentData["runs"][number];

export function RunsPanel({ d }: { d: AssignmentData }) {
  return (
    <Panel title="Runs" padded={false}>
      {d.runs.length ? (
        <ul className="divide-y">
          {d.runs.map((r) => (
            <RunItem key={r.id} r={r} d={d} />
          ))}
        </ul>
      ) : (
        <EmptyState icon="play" title="No runs yet" description={d.assignment.status === "Draft" ? "A draft starts nothing until it's activated." : undefined} />
      )}
    </Panel>
  );
}

type SourceInput = { title?: string; version?: number; source_id?: string; observed_at?: string };

function RunItem({ r, d }: { r: Run; d: AssignmentData }) {
  const [open, setOpen] = useState(false);
  const inputs = (r.inputs ?? {}) as Record<string, unknown>;
  const sources = (inputs.sources as SourceInput[] | undefined) ?? [];
  const record = inputs.record as { external_id?: string; version?: number; observed_at?: string } | undefined;
  const facts = inputs.facts as Record<string, unknown> | undefined;
  const agentRev = d.revisions.find((x) => x.id === inputs.agent_revision_id);
  const procRevId = inputs.procedure_revision_id as string | undefined;
  const otherInputs = Object.entries(inputs).filter(([k]) => !["sources", "record", "facts", "agent_revision_id", "procedure_revision_id"].includes(k));

  return (
    <li className="p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusTag kind="run" value={r.status} />
            <span className="font-mono text-xs uppercase tracking-eyebrow text-muted-foreground">{humanize(r.trigger)}</span>
            {r.simulated && <SimulatedTag />}
          </div>
          {r.summary && <p>{r.summary}</p>}
          {r.error && <p className="text-blocked">Error: {r.error}</p>}
          <p className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
            <span>{r.model ?? (r.simulated ? "No model (simulated)" : "No model recorded")}</span>
            <span>Queued <Time iso={r.created_at} /></span>
            {r.started_at && <span title={fmtDateTime(r.started_at)}>Started {fmtDateTime(r.started_at)}</span>}
            {r.finished_at && <span title={fmtDateTime(r.finished_at)}>Finished {fmtDateTime(r.finished_at)}</span>}
          </p>
        </div>
        <Button
          size="small"
          variant="minimal"
          icon={open ? "chevron-up" : "chevron-down"}
          text={open ? "Hide details" : "Details"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        />
      </div>
      <Collapse isOpen={open}>
        <div className="mt-3 space-y-3 rounded-md bg-muted/60 p-3 text-xs">
          {r.instruction && (
            <div>
              <Eyebrow>Instruction</Eyebrow>
              <p className="mt-1">{r.instruction}</p>
            </div>
          )}
          <div>
            <Eyebrow>Inputs</Eyebrow>
            <ul className="mt-1 space-y-0.5">
              {sources.map((s, i) => (
                <li key={s.source_id ?? i}>
                  Source: {s.title} · version {s.version}
                  {s.observed_at && <span className="text-muted-foreground"> · observed {fmtDateTime(s.observed_at)}</span>}
                </li>
              ))}
              {record && (
                <li>
                  Record: <span className="font-mono">{record.external_id}</span> · version {record.version}
                  {record.observed_at && <span className="text-muted-foreground"> · read {fmtDateTime(record.observed_at)}</span>}
                </li>
              )}
              {typeof inputs.agent_revision_id === "string" && <li>Agent revision: {agentRev ? `Revision ${agentRev.revision}` : inputs.agent_revision_id}</li>}
              {procRevId && (
                <li>
                  Procedure revision:{" "}
                  {d.procedure && procRevId === d.assignment.procedure_revision_id ? `${d.procedure.name} · Revision ${d.procedure.revision}` : procRevId}
                </li>
              )}
              {otherInputs.map(([k, v]) => (
                <li key={k} className="break-words">
                  {humanize(k)}: {typeof v === "object" ? JSON.stringify(v) : String(v)}
                </li>
              ))}
              {!sources.length && !record && !otherInputs.length && !inputs.agent_revision_id && <li className="text-muted-foreground">No inputs recorded yet.</li>}
            </ul>
          </div>
          {facts && (
            <div>
              <Eyebrow>Calculated facts</Eyebrow>
              <dl className="mt-1 grid grid-cols-[minmax(120px,auto)_1fr] gap-x-3 gap-y-0.5">
                {Object.entries(facts)
                  .filter(([, v]) => v !== null && v !== undefined)
                  .map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted-foreground">{humanize(k)}</dt>
                      <dd className="break-words">{String(v)}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          )}
          <div>
            <Eyebrow>Tool calls</Eyebrow>
            {r.tool_calls?.length ? (
              <ul className="mt-1 space-y-1">
                {r.tool_calls.map((t, i) => {
                  const input = t.input as { expression?: string } | null;
                  return (
                    <li key={i} className="font-mono">
                      {t.name}
                      {input?.expression ? `(${input.expression})` : input ? ` ${JSON.stringify(input)}` : ""} → {typeof t.output === "object" ? JSON.stringify(t.output) : String(t.output)}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-1 text-muted-foreground">No tool calls recorded.</p>
            )}
          </div>
        </div>
      </Collapse>
    </li>
  );
}
