"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { HTMLSelect, Icon } from "@blueprintjs/core";
import { cn } from "@/lib/utils";

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("prose-loura", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

const rtf = typeof Intl !== "undefined" ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }) : null;

export function relTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (!rtf) return new Date(iso).toLocaleString();
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), "day");
  return fmtDate(iso);
}

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export const fmtDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

export function Time({ iso, className }: { iso: string | null | undefined; className?: string }) {
  return (
    <time dateTime={iso ?? undefined} title={fmtDateTime(iso)} className={cn("tabular", className)}>
      {relTime(iso)}
    </time>
  );
}

export interface ActivityItem {
  id: string;
  actor: string;
  actor_kind: "person" | "agent" | "system";
  summary: string;
  created_at: string;
}

/** Routine progress stays here — inspectable, not a notification. */
export function ActivityList({ items, empty = "No activity yet." }: { items: ActivityItem[]; empty?: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ol className="space-y-3">
      {items.map((a) => (
        <li key={a.id} className="flex gap-3 text-sm">
          <span
            className={cn(
              "mt-1.5 size-2 shrink-0 rounded-full",
              a.actor_kind === "agent" ? "bg-brand" : a.actor_kind === "system" ? "bg-muted-foreground/50" : "bg-foreground/70",
            )}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="leading-snug">
              <span className="font-medium">{a.actor}</span>{" "}
              {a.actor_kind === "agent" && <span className="text-[11px] text-muted-foreground">(agent) </span>}
              <span className="text-foreground/90">{a.summary}</span>
            </p>
            <Time iso={a.created_at} className="text-xs text-muted-foreground" />
          </div>
        </li>
      ))}
    </ol>
  );
}

export function PersonSelect({
  people,
  value,
  onChange,
  placeholder = "Choose a person",
  exclude = [],
  id,
}: {
  people: { user_id: string; full_name?: string; name?: string; title?: string; status?: string }[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  exclude?: string[];
  id?: string;
}) {
  return (
    <HTMLSelect
      id={id}
      fill
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      options={[
        { value: "", label: placeholder },
        ...people
          .filter((p) => !exclude.includes(p.user_id) && p.status !== "removed")
          .map((p) => ({ value: p.user_id, label: `${p.full_name ?? p.name}${p.title ? ` — ${p.title}` : ""}` })),
      ]}
    />
  );
}

export function RecordLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-1 font-medium text-foreground hover:underline", className)}>
      {children}
      <Icon icon="arrow-right" size={11} className="opacity-0 transition-opacity group-hover:opacity-60" />
    </Link>
  );
}

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function Avatar({ name, kind = "person", size = 24 }: { name: string; kind?: "person" | "agent"; size?: number }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-mono font-medium",
        kind === "agent" ? "bg-brand/15 text-brand-strong ring-1 ring-brand/40" : "bg-secondary text-foreground ring-1 ring-input",
      )}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.38) }}
      aria-hidden
    >
      {kind === "agent" ? <Icon icon="predictive-analysis" size={Math.round(size * 0.5)} /> : initials(name)}
    </span>
  );
}
