"use client";

import { useState } from "react";
import { Button, FormGroup, HTMLSelect } from "@blueprintjs/core";
import { useOp } from "@/lib/api";
import { EffectNote, Eyebrow, Panel } from "@/components/ui/layout";
import { Pill } from "@/components/ui/status";
import { InlineError, humanize, opLabel } from "@/components/ui/common";
import type { AssignmentData } from "./header";

export function ScopePanel({ d }: { d: AssignmentData }) {
  const a = d.assignment;
  const scope = a.scope as Record<string, unknown>;
  const pendingInstructions = scope.pending_instructions as string | undefined;
  const allowed = (scope.allowed_operations as string[] | undefined) ?? [];
  const published = d.revisions.find((r) => r.id === d.agent.published_revision_id);
  const ended = a.status === "Ended" || a.status === "Ending";

  return (
    <Panel title="Purpose and scope">
      <div className="space-y-4 text-sm">
        <div>
          <Eyebrow>Instructions</Eyebrow>
          <p className="mt-1 whitespace-pre-wrap">{a.instructions || "—"}</p>
          {pendingInstructions && (
            <div className="mt-2 rounded-md border border-dashed p-2">
              <Pill tone="pending">Pending — applies when the current run finishes</Pill>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{pendingInstructions}</p>
            </div>
          )}
        </div>

        <div>
          <Eyebrow>May propose</Eyebrow>
          {allowed.length ? (
            <ul className="mt-1 space-y-1">
              {allowed.map((op) => (
                <li key={op}>{opLabel(op)}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-muted-foreground">No external operations.</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">Whether a proposal needs approval comes from the organization&apos;s action rules.</p>
        </div>

        <div>
          <Eyebrow>Agent definition</Eyebrow>
          <p className="mt-1">
            {d.agent.name} · Revision {d.revision.revision}
            {published && published.id !== d.revision.id && <span className="text-muted-foreground"> · Published revision is {published.revision}</span>}
          </p>
          {d.revision.tools?.length > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">Tools: {d.revision.tools.map(humanize).join(", ")}</p>
          )}
          {d.pending_revision && (
            <p className="mt-1">
              <Pill tone="pending">Revision {d.pending_revision.revision} pending — applies when no run is executing</Pill>
            </p>
          )}
          {d.can_intervene && !ended && <ApplyRevision d={d} />}
        </div>

        <div>
          <Eyebrow>Procedure</Eyebrow>
          {d.procedure ? (
            <div className="mt-1 space-y-2">
              <p>
                {d.procedure.name} · Revision {d.procedure.revision}
              </p>
              {d.procedure.config?.steps?.length > 0 && (
                <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                  {d.procedure.config.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              )}
              {d.procedure.config?.human_involvement && (
                <p className="text-xs">
                  <span className="text-muted-foreground">Human involvement: </span>
                  {d.procedure.config.human_involvement}
                </p>
              )}
            </div>
          ) : a.procedure_revision_id ? (
            <p className="mt-1 text-muted-foreground">A procedure revision applies, but its details aren&apos;t visible to you.</p>
          ) : (
            <p className="mt-1 text-muted-foreground">No procedure — the agent works from its instructions.</p>
          )}
        </div>
      </div>
    </Panel>
  );
}

function ApplyRevision({ d }: { d: AssignmentData }) {
  const choices = d.revisions.filter((r) => r.id !== d.assignment.agent_revision_id);
  const [revId, setRevId] = useState("");
  const apply = useOp("applyRevision", {
    silent: true,
    success: () => `Revision ${d.revisions.find((r) => r.id === revId)?.revision ?? ""} requested for this assignment`,
  });
  if (!choices.length) return null;
  return (
    <div className="mt-3 space-y-2 rounded-md bg-muted/60 p-3">
      <FormGroup label="Apply a different revision" labelFor="apply-rev" className="!mb-0">
        <div className="flex gap-2">
          <HTMLSelect
            id="apply-rev"
            fill
            value={revId}
            onChange={(e) => setRevId(e.currentTarget.value)}
            options={[
              { value: "", label: "Choose a revision" },
              ...choices.map((r) => ({
                value: r.id,
                label: `Revision ${r.revision}${r.id === d.agent.published_revision_id ? " (published)" : ""}`,
              })),
            ]}
          />
          <Button
            text="Apply revision"
            variant="outlined"
            disabled={!revId}
            loading={apply.isPending}
            onClick={() => apply.mutate({ assignment_id: d.assignment.id, agent_revision_id: revId }, { onSuccess: () => setRevId("") })}
          />
        </div>
      </FormGroup>
      <EffectNote>Applies to this assignment only, once no run is executing. Other assignments keep their revision.</EffectNote>
      <InlineError error={apply.error} />
    </div>
  );
}
