"use client";

import { useEffect, useState } from "react";
import { Icon } from "@blueprintjs/core";
import { cn } from "@/lib/utils";

/** Every request gets the same response window; after it, the request escalates. */
export const RESPONSE_WINDOW_HOURS = 24;

const HOUR = 3_600_000;

function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function deadlineFor(createdAt: string, now: number) {
  const due = new Date(createdAt).getTime() + RESPONSE_WINDOW_HOURS * HOUR;
  const left = due - now;
  return { due: new Date(due), left, overdue: left <= 0 };
}

function escalationText(left: number) {
  if (left <= 0) return "Escalated";
  const hours = Math.ceil(left / HOUR);
  if (hours > 1) return `Escalating in ${hours} Hours`;
  const minutes = Math.max(1, Math.ceil(left / 60_000));
  return minutes >= 60 ? "Escalating in 1 Hour" : `Escalating in ${minutes} Minutes`;
}

const dueFmt = (d: Date) => d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** The answer window and the escalation line under it. */
export function RequestDeadline({ createdAt, className }: { createdAt: string; className?: string }) {
  const now = useNow();
  const { due, left, overdue } = deadlineFor(createdAt, now);
  return (
    <div className={cn("space-y-0.5", className)}>
      <p className="font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground">Answer within {RESPONSE_WINDOW_HOURS} hours</p>
      <p className="text-sm font-medium tabular text-foreground">
        {overdue ? "Was due" : "Due"} {dueFmt(due)}
      </p>
      <p className="inline-flex items-center gap-1 text-sm font-semibold text-brand-strong">
        <Icon icon={overdue ? "warning-sign" : "time"} size={12} aria-hidden />
        {escalationText(left)}
      </p>
    </div>
  );
}

/** One-line version for lists. */
export function EscalationNote({ createdAt, className }: { createdAt: string; className?: string }) {
  const now = useNow();
  const { left } = deadlineFor(createdAt, now);
  return (
    <span className={cn("inline-flex items-center gap-1 font-medium text-brand-strong", className)}>
      <Icon icon="time" size={11} aria-hidden />
      {escalationText(left)}
    </span>
  );
}
