"use client";

import { useState } from "react";
import { Collapse, Icon } from "@blueprintjs/core";
import { RecordLink } from "@/components/ui/content";

export type EvidenceItem = { title: string; quote: string; kind: string; system: string; ref: string; at: string | null; source_id: string | null };

/** "14 Sep · 09:12Z" — when a record was read, in UTC. */
export function asOf(iso: string) {
  const t = new Date(iso);
  const day = t.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const time = t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
  return `${day} · ${time}Z`;
}

/** What the decision rests on: each record quoted, with a way to open it. */
export function Evidence({ items }: { items: EvidenceItem[] }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="border-t pt-4">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 text-left">
        <h4 className="text-[15px] font-medium">Evidence</h4>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? "source" : "sources"}
          <Icon icon={open ? "chevron-up" : "chevron-down"} size={14} aria-hidden />
        </span>
      </button>
      <Collapse isOpen={open}>
        <ul className="divide-y">
          {items.map((e) => (
            <li key={`${e.ref}-${e.title}`} className="space-y-1.5 py-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[15px] font-medium">{e.title}</p>
                {e.at && <span className="text-xs text-muted-foreground">{asOf(e.at)}</span>}
              </div>
              {e.quote && <blockquote className="border-l-2 pl-3 text-sm leading-relaxed text-foreground/90">{e.quote}</blockquote>}
              <p className="flex flex-wrap items-center gap-2 text-xs">
                {e.source_id ? (
                  <RecordLink href={`/sources/${e.source_id}`}>Open source</RecordLink>
                ) : (
                  <span className="text-muted-foreground">No open record</span>
                )}
                <span className="font-mono text-muted-foreground">
                  {e.kind} · {e.system.toLowerCase()} · {e.ref}
                </span>
              </p>
            </li>
          ))}
        </ul>
      </Collapse>
    </section>
  );
}

/** How each figure was worked out, for anyone who wants to check the arithmetic. */
export function TechnicalDetails({ rows }: { rows: { label: string; value: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="border-t pt-4">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 text-left">
        <h4 className="text-[15px] font-medium text-muted-foreground">Technical details</h4>
        <Icon icon={open ? "chevron-up" : "chevron-down"} size={14} className="text-muted-foreground" aria-hidden />
      </button>
      <Collapse isOpen={open}>
        <dl className="divide-y pt-1 text-sm">
          {rows.map((r) => (
            <div key={r.label + r.value} className="flex flex-wrap items-baseline justify-between gap-4 py-2">
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className="text-right font-mono text-xs">{r.value}</dd>
            </div>
          ))}
        </dl>
      </Collapse>
    </section>
  );
}

