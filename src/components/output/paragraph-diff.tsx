"use client";

import { Markdown } from "@/components/ui/content";
import { cn } from "@/lib/utils";

export function paragraphs(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Paragraph-level comparison: a paragraph is marked when the other side has no identical paragraph. */
export function paragraphDiff(left: string, right: string) {
  const l = paragraphs(left);
  const r = paragraphs(right);
  const inL = new Set(l);
  const inR = new Set(r);
  return {
    left: l.map((text) => ({ text, changed: !inR.has(text) })),
    right: r.map((text) => ({ text, changed: !inL.has(text) })),
  };
}

export function ParagraphDiff({
  left,
  right,
  leftLabel,
  rightLabel,
  leftMeta,
  rightMeta,
}: {
  left: string;
  right: string;
  leftLabel: string;
  rightLabel: string;
  leftMeta?: React.ReactNode;
  rightMeta?: React.ReactNode;
}) {
  const d = paragraphDiff(left, right);
  const changedL = d.left.filter((p) => p.changed).length;
  const changedR = d.right.filter((p) => p.changed).length;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Column label={leftLabel} meta={leftMeta} items={d.left} cls="diff-removed" srNote="Only in this version" summary={`${changedL} paragraph${changedL === 1 ? "" : "s"} not in the other side`} />
      <Column label={rightLabel} meta={rightMeta} items={d.right} cls="diff-added" srNote="Changed or added here" summary={`${changedR} paragraph${changedR === 1 ? "" : "s"} changed or added`} />
    </div>
  );
}

function Column({
  label,
  meta,
  items,
  cls,
  srNote,
  summary,
}: {
  label: string;
  meta?: React.ReactNode;
  items: { text: string; changed: boolean }[];
  cls: string;
  srNote: string;
  summary: string;
}) {
  return (
    <section className="min-w-0 rounded-lg border bg-card" aria-label={label}>
      <header className="border-b px-3 py-2">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          {meta ? <>{meta} · </> : null}
          {summary}
        </p>
      </header>
      <div className="max-h-[520px] space-y-1 overflow-y-auto p-2">
        {items.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">Empty.</p>}
        {items.map((p, i) => (
          <div key={i} className={cn("rounded px-2 py-1", p.changed && cls)}>
            {p.changed && <span className="sr-only">{srNote}: </span>}
            <Markdown>{p.text}</Markdown>
          </div>
        ))}
      </div>
    </section>
  );
}
