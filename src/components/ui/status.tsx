"use client";

import { Tag } from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";

export type Tone = "neutral" | "muted" | "strong" | "progress" | "ok" | "warn" | "danger" | "pending" | "agent" | "urgent";

const MAP: Record<string, { label: string; tone: Tone; icon?: IconName }> = {
  // Task
  "task:Open": { label: "Open", tone: "neutral" },
  "task:InProgress": { label: "In progress", tone: "progress" },
  "task:InReview": { label: "In review", tone: "warn" },
  "task:Done": { label: "Done", tone: "ok", icon: "tick" },
  "task:Cancelled": { label: "Cancelled", tone: "muted" },
  // Request
  "request:Open": { label: "Needs response", tone: "strong" },
  "request:Resolved": { label: "Resolved", tone: "ok" },
  "request:Withdrawn": { label: "Withdrawn", tone: "muted" },
  "request:Superseded": { label: "Superseded", tone: "muted" },
  // Review submission
  "review:Open": { label: "Review requested", tone: "warn" },
  "review:Accepted": { label: "Version accepted", tone: "ok", icon: "tick" },
  "review:ChangesRequested": { label: "Changes requested", tone: "danger" },
  "review:Withdrawn": { label: "Withdrawn", tone: "muted" },
  "review:Superseded": { label: "Superseded", tone: "muted" },
  // Assignment
  "assignment:Draft": { label: "Draft", tone: "pending" },
  "assignment:Active": { label: "Active", tone: "progress" },
  "assignment:Pausing": { label: "Pausing…", tone: "pending" },
  "assignment:Paused": { label: "Paused", tone: "warn", icon: "pause" },
  "assignment:Ending": { label: "Ending…", tone: "pending" },
  "assignment:Ended": { label: "Ended", tone: "muted" },
  // Run
  "run:Queued": { label: "Queued", tone: "pending" },
  "run:Running": { label: "Running", tone: "progress" },
  "run:Waiting": { label: "Waiting", tone: "warn" },
  "run:Succeeded": { label: "Succeeded", tone: "ok" },
  "run:Failed": { label: "Failed", tone: "danger" },
  "run:Stopped": { label: "Stopped", tone: "muted" },
  // External action
  "action:AwaitingAuthorization": { label: "Awaiting approval", tone: "strong" },
  "action:Approved": { label: "Approved — not yet confirmed", tone: "pending" },
  "action:Declined": { label: "Declined", tone: "muted" },
  "action:Dispatched": { label: "Sent — awaiting confirmation", tone: "pending" },
  "action:Confirmed": { label: "Confirmed", tone: "ok", icon: "tick" },
  "action:StateConfirmed": { label: "State confirmed · cause unconfirmed", tone: "ok" },
  "action:Failed": { label: "Failed", tone: "danger" },
  "action:Uncertain": { label: "Outcome uncertain", tone: "pending", icon: "help" },
  "action:Superseded": { label: "Superseded", tone: "muted" },
  "action:Blocked": { label: "Blocked by current rule", tone: "danger" },
  // Source event
  "event:Received": { label: "Received", tone: "neutral" },
  "event:Matched": { label: "Matched", tone: "progress" },
  "event:Held": { label: "Held while paused", tone: "warn" },
  "event:Irrelevant": { label: "No assignment follows it", tone: "muted" },
  "event:Duplicate": { label: "Duplicate", tone: "muted" },
  // Definition test
  "test:Running": { label: "Running", tone: "progress" },
  "test:Completed": { label: "Completed", tone: "ok" },
  "test:Interrupted": { label: "Interrupted — incomplete", tone: "danger" },
  "test:Failed": { label: "Failed", tone: "danger" },
};

export type StatusKind = "task" | "request" | "review" | "assignment" | "run" | "action" | "event" | "test";

export function statusInfo(kind: StatusKind, value: string) {
  return MAP[`${kind}:${value}`] ?? { label: value, tone: "neutral" as Tone };
}

export function StatusTag({ kind, value, className }: { kind: StatusKind; value: string; className?: string }) {
  const { label, tone, icon } = statusInfo(kind, value);
  return (
    <Tag minimal data-pill data-tone={tone} icon={icon} className={className}>
      {label}
    </Tag>
  );
}

export function Pill({ tone = "neutral", icon, children, title, className }: { tone?: Tone; icon?: IconName; children: React.ReactNode; title?: string; className?: string }) {
  return (
    <Tag minimal data-pill data-tone={tone} icon={icon} title={title} className={className}>
      {children}
    </Tag>
  );
}

/** Agent outputs from the simulated path are never presented as agent evidence. */
export function SimulatedTag() {
  return (
    <Pill tone="pending" icon="lab-test" title="No model key is configured. This result came from a deterministic simulation and is not evidence of agent capability.">
      Simulated agent
    </Pill>
  );
}
