"use client";

import Link from "next/link";
import type { ViewData } from "@/lib/api";
import { StatusTag } from "@/components/ui/status";
import { Panel } from "@/components/ui/layout";
import { Time } from "@/components/ui/content";
import { requestTypeInfo, responseWords } from "@/components/requests/labels";

type TaskView = ViewData<"task">;

export function TaskRequests({ d, actions }: { d: TaskView; actions?: React.ReactNode }) {
  // Open requests are shown at the top of the page as blocking.
  const answered = d.requests.filter((r) => r.status !== "Open");
  return (
    <Panel title="Answered requests" actions={actions} padded={false} className="overflow-hidden rounded-3xl">
      {answered.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">No answered requests yet.</p>
      ) : (
        <ul className="divide-y">
          {answered.map((r) => (
            <li key={r.id} className="space-y-1.5 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-eyebrow text-muted-foreground">{requestTypeInfo(r.type).label}</span>
                  <StatusTag kind="request" value={r.status} />
                </span>
                <Time iso={r.created_at} className="text-xs text-muted-foreground" />
              </div>
              <Link href={`/requests/${r.id}`} className="block text-sm leading-snug hover:underline">
                {r.question}
              </Link>
              <p className="text-xs text-muted-foreground">
                {r.requester} → {r.recipient}
              </p>
              {r.response_kind && (
                <p className="text-sm">
                  <span className="text-muted-foreground">{responseWords(r.response_kind)}</span>
                  {r.response_text && <span className="whitespace-pre-wrap">: {r.response_text}</span>}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
