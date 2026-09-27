"use client";

import Link from "next/link";
import { Icon } from "@blueprintjs/core";
import { cn } from "@/lib/utils";

/**
 * Something is holding work up. Neutral surface with one coral accent (the label);
 * `flat` drops the frame for use inside a list that already has one.
 */
export function BlockerCard({
  label = "Blocker",
  title,
  children,
  aside,
  flat = false,
  className,
}: {
  label?: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  aside?: React.ReactNode;
  flat?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "grid gap-4",
        flat ? "px-5 py-4" : "rounded-lg border border-l-[3px] border-l-brand-strong bg-card p-4",
        aside && "md:grid-cols-[minmax(0,1fr)_210px]",
        className,
      )}
    >
      <div className="min-w-0 space-y-1.5">
        <p className="inline-flex items-center gap-1.5 font-mono text-[10.5px] font-medium uppercase tracking-eyebrow text-brand-strong">
          <Icon icon="hand" size={11} aria-hidden />
          {label}
        </p>
        <p className="text-base leading-snug">{title}</p>
        {children}
      </div>
      {aside && <div className="flex flex-col justify-between gap-3 border-t pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">{aside}</div>}
    </div>
  );
}

/** Compact version for list rows: tasks this one is waiting on. */
export function WaitingOnNote({ tasks, className }: { tasks: { id: string; title: string }[]; className?: string }) {
  if (!tasks.length) return null;
  return (
    <div className={cn("flex items-start gap-2 rounded-md border border-l-[3px] border-l-brand-strong bg-card px-3 py-2 text-xs", className)}>
      <Icon icon="hand" size={12} className="mt-0.5 shrink-0 text-brand-strong" aria-hidden />
      <span className="min-w-0">
        <span className="font-semibold text-brand-strong">Blocked — waiting for </span>
        {tasks.map((t, i) => (
          <span key={t.id}>
            {i > 0 && ", "}
            <Link href={`/tasks/${t.id}`} className="font-medium text-foreground hover:underline">
              {t.title}
            </Link>
          </span>
        ))}
      </span>
    </div>
  );
}
