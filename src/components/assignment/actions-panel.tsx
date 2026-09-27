"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@blueprintjs/core";
import { useOp } from "@/lib/api";
import { EmptyState, EffectNote, Eyebrow, Panel } from "@/components/ui/layout";
import { Time } from "@/components/ui/content";
import { StatusTag } from "@/components/ui/status";
import { InlineError, ResultNote, humanize, opLabel } from "@/components/ui/common";
import type { AssignmentData } from "./header";

type Attempt = AssignmentData["attempts"][number];

export function ActionsPanel({ d }: { d: AssignmentData }) {
  return (
    <Panel
      title="Actions"
      padded={false}
    >
      {d.attempts.length ? (
        <ul className="divide-y">
          {d.attempts.map((x) => (
            <AttemptItem key={x.id} x={x} />
          ))}
        </ul>
      ) : (
        <EmptyState icon="send-to" title="No actions proposed" description="Proposals appear here with their approval and evidence." />
      )}
    </Panel>
  );
}

function AttemptItem({ x }: { x: Attempt }) {
  const statusValue = x.status === "AwaitingAuthorization" && x.decided_at ? "Approved" : x.status;
  return (
    <li className="space-y-3 p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{opLabel(x.operation)}</p>
          <p className="text-xs text-muted-foreground">{x.target_label}</p>
        </div>
        <StatusTag kind="action" value={statusValue} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/60 px-3 py-2">
        <span className="text-muted-foreground">{humanize(x.field)}</span>
        <span className="font-medium">{x.current_value ?? "—"}</span>
        <span aria-hidden className="text-muted-foreground">→</span>
        <span className="sr-only">to</span>
        <span className="font-medium">{x.proposed_value}</span>
      </div>
      <p>
        <span className="text-muted-foreground">Reason: </span>
        {x.reason}
      </p>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        {x.approver && <span>Approver: {x.approver}</span>}
        {x.decided_by_name && (
          <span>
            Decided by {x.decided_by_name} {x.decided_at && <Time iso={x.decided_at} />}
          </span>
        )}
        {x.authority_basis && <span>Basis: {x.authority_basis}</span>}
        {x.request_id && (
          <span className="inline-flex items-center gap-1.5">
            Request
            {x.request_status && <StatusTag kind="request" value={x.request_status} />}
            <Link href={`/requests/${x.request_id}`} className="font-medium text-foreground hover:underline">
              Open request
            </Link>
          </span>
        )}
      </div>

      {x.status === "Uncertain" && <UncertainCheck x={x} />}

      {x.evidence.length > 0 && (
        <div>
          <Eyebrow>Evidence</Eyebrow>
          <ol className="mt-2 space-y-2 border-l pl-3">
            {x.evidence.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[17px] top-1.5 size-2 rounded-full bg-muted-foreground/50" aria-hidden />
                <p className="text-xs">
                  <span className="font-mono uppercase tracking-eyebrow text-muted-foreground">{humanize(e.kind)}</span>{" "}
                  <Time iso={e.created_at} className="text-muted-foreground" />
                </p>
                <p>{e.establishes}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </li>
  );
}

function UncertainCheck({ x }: { x: Attempt }) {
  const [message, setMessage] = useState<string | null>(null);
  const check = useOp("checkActionResult", { silent: true, success: (r) => r.message });
  return (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      <EffectNote tone="warn">The update was sent but no confirmation came back. Loura won&apos;t repeat it without checking.</EffectNote>
      <Button
        size="small"
        variant="outlined"
        icon="search"
        text="Check current record"
        loading={check.isPending}
        onClick={() => check.mutate({ attempt_id: x.id }, { onSuccess: (r) => setMessage(r.message) })}
      />
      <p className="text-xs text-muted-foreground">Reads the target record. It never sends the update again.</p>
      <InlineError error={check.error} />
      {message && <ResultNote tone="neutral">{message}</ResultNote>}
    </div>
  );
}
