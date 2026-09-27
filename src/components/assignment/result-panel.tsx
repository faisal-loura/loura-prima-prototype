"use client";

import Link from "next/link";
import { EmptyState, Eyebrow, Panel } from "@/components/ui/layout";
import { Markdown, Time } from "@/components/ui/content";
import { Pill, SimulatedTag } from "@/components/ui/status";
import { sourceKeyData } from "@/components/ui/common";
import type { AssignmentData } from "./header";

export function ResultPanel({ d }: { d: AssignmentData }) {
  const out = d.output;
  const lastDone = d.runs.find((r) => r.status === "Succeeded");
  return (
    <Panel
      title="Latest result"
      actions={
        out ? (
          <>
            {lastDone?.simulated && <SimulatedTag />}
            <Pill tone="muted">Version {out.version}</Pill>
            <Link href={`/outputs/${out.id}`} className="text-xs font-medium hover:underline">
              Open document
            </Link>
          </>
        ) : undefined
      }
    >
      {out ? (
        <div className="space-y-4">
          {out.content ? <Markdown>{out.content}</Markdown> : <p className="text-sm text-muted-foreground">This version has no content.</p>}
          {lastDone && (
            <p className="text-xs text-muted-foreground">
              From the {lastDone.trigger} run finished <Time iso={lastDone.finished_at} />.
            </p>
          )}
        </div>
      ) : (
        <EmptyState icon="document" title="No result yet" description="The assessment appears here after the first run." />
      )}

      {d.sources.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <Eyebrow>Sources used</Eyebrow>
          <ul className="mt-2 space-y-1.5 text-sm">
            {d.sources.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <Link href={`/sources/${s.id}`} className="hover:underline">
                  {s.title} <span className="text-xs text-muted-foreground">v{s.version}</span>
                </Link>
                <span className="text-xs text-muted-foreground">{sourceKeyData(s.data as Record<string, unknown>)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
