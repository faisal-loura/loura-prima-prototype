"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Collapse, Icon } from "@blueprintjs/core";
import { useView, type ViewData } from "@/lib/api";
import { ErrorState, LoadingState } from "@/components/ui/layout";
import { Markdown, RecordLink, Time } from "@/components/ui/content";
import { TechnicalDetails } from "@/components/requests/evidence";
import { cn } from "@/lib/utils";

type TaskView = ViewData<"task">;
type Decision = NonNullable<TaskView["kase"]>["context"][number];
type Item = Decision["evidence"][number];

/** "14 Sep · 09:12Z" — when a record was read, in UTC. */
function asOf(iso: string) {
  const t = new Date(iso);
  const day = t.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const time = t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
  return `${day} · ${time}Z`;
}

/**
 * What every decision in this case was based on: the records each stage read, in the order
 * the decisions happened. Opening a record shows it in full beside the case.
 */
export function CaseContext({ d }: { d: TaskView }) {
  const decisions = d.kase?.context ?? [];
  const [openSource, setOpenSource] = useState<string | null>(null);
  if (!decisions.length) return null;

  return (
    <section className="overflow-hidden rounded-3xl border bg-card shadow-[0_1px_3px_rgb(28_26_24/0.04)]">
      <div className="border-b px-5 py-4">
        <h2 className="text-[15px] font-medium">Context</h2>
        <p className="text-sm text-muted-foreground">What each decision in this case was based on.</p>
      </div>

      <ul className="divide-y">
        {decisions.map((dec) => (
          <DecisionBlock key={dec.request_id} decision={dec} onOpen={setOpenSource} />
        ))}
      </ul>

      {openSource && <SourceDrawer sourceId={openSource} onClose={() => setOpenSource(null)} />}
    </section>
  );
}

function DecisionBlock({ decision, onOpen }: { decision: Decision; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <li>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-start gap-3 px-5 py-3.5 text-left">
        <Icon icon={open ? "chevron-down" : "chevron-right"} size={14} className="mt-1 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] leading-snug">
            {decision.stage ? <span className="text-muted-foreground">Stage {decision.stage} · </span> : null}
            {decision.decision}
          </span>
          <span className="block text-sm text-muted-foreground">
            {decision.decided ?? "Awaiting a decision"} · <Time iso={decision.at} /> · {decision.evidence.length}{" "}
            {decision.evidence.length === 1 ? "source" : "sources"}
          </span>
        </span>
      </button>

      <Collapse isOpen={open}>
        <div className="space-y-3 px-5 pb-4 pl-12">
          <ul className="space-y-2">
            {decision.evidence.map((e) => (
              <EvidenceRow key={`${e.ref}-${e.title}`} item={e} onOpen={onOpen} />
            ))}
          </ul>
          {decision.technical.length > 0 && <TechnicalDetails rows={decision.technical} />}
        </div>
      </Collapse>
    </li>
  );
}

function EvidenceRow({ item, onOpen }: { item: Item; onOpen: (id: string) => void }) {
  const body = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-white p-1">
        {item.logo ? (
          <Image src={item.logo} alt="" width={22} height={22} unoptimized className="max-h-full max-w-full object-contain" />
        ) : (
          <Icon icon="database" size={14} className="text-muted-foreground" aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px]">{item.title}</span>
        <span className="block truncate text-sm text-muted-foreground">{item.quote}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
          <span>
            {item.kind} · {item.system.toLowerCase()} · {item.ref}
          </span>
          {item.at && <span>{asOf(item.at)}</span>}
          {item.attachments.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Icon icon="paperclip" size={10} aria-hidden />
              {item.attachments.length}
            </span>
          )}
        </span>
      </span>
    </>
  );

  if (!item.source_id) {
    return <li className="flex items-start gap-3 rounded-2xl border px-3 py-2.5 opacity-70">{body}</li>;
  }
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(item.source_id!)}
        className="flex w-full items-start gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors hover:border-input hover:bg-accent/50"
      >
        {body}
        <Icon icon="chevron-right" size={14} className="mt-2 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    </li>
  );
}

/** The record itself, beside the case — the same drawer the inbox uses. */
function SourceDrawer({ sourceId, onClose }: { sourceId: string; onClose: () => void }) {
  const q = useView("source", { id: sourceId }, { poll: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const s = q.data?.source;
  const data = (s?.data ?? {}) as { system?: string; ref?: string; attachments?: { name: string; kind: string }[] };
  const attachments = data.attachments ?? [];

  return (
    <aside
      aria-label="Source"
      className="fixed inset-y-2 left-2 right-2 z-50 overflow-y-auto rounded-[28px] border bg-card p-6 shadow-[0_24px_60px_-16px_rgb(28_26_24/0.22)] animate-in slide-in-from-right-4 fade-in-0 duration-200 sm:left-auto sm:w-[min(520px,calc(100vw-1rem))]"
    >
      <div className="flex items-start justify-between gap-3 border-b pb-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{data.system ?? "Record"}</p>
          <h2 className="font-display text-2xl leading-tight text-balance">{s?.title ?? "Source"}</h2>
          <p className="pt-1 text-xs text-muted-foreground">
            {s?.origin}
            {data.ref ? ` · ${data.ref}` : ""}
            {s?.observed_at ? ` · read ${asOf(s.observed_at)}` : ""}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 rounded-full p-1.5 text-muted-foreground hover:bg-accent">
          <Icon icon="cross" size={16} aria-hidden />
        </button>
      </div>

      <div className="py-5">
        {q.isPending ? (
          <LoadingState rows={3} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <div className="space-y-5">
            {attachments.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm text-muted-foreground">Attachments</h3>
                <ul className="space-y-2">
                  {attachments.map((a) => (
                    <li key={a.name} className="flex items-center gap-3 rounded-2xl border px-3 py-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                        <Icon icon="document" size={14} className="text-muted-foreground" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
                      <span className="shrink-0 font-mono text-[11px] uppercase text-muted-foreground">{a.kind}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">Attachments are fixtures in this prototype and can&apos;t be downloaded.</p>
              </section>
            )}

            <section className={cn("rounded-2xl bg-muted/50 p-4", !s?.content && "text-muted-foreground")}>
              {s?.content ? <Markdown>{s.content}</Markdown> : <p className="text-sm">This record has no written content.</p>}
            </section>

            <RecordLink href={`/sources/${sourceId}`}>Open the full source page</RecordLink>
          </div>
        )}
      </div>
    </aside>
  );
}
