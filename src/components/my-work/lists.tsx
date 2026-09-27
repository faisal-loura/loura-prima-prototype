"use client";

import Link from "next/link";
import { useState } from "react";
import { SegmentedControl, Switch } from "@blueprintjs/core";
import type { ViewData } from "@/lib/api";
import { StatusTag } from "@/components/ui/status";
import { EmptyState } from "@/components/ui/layout";
import { Avatar, Time } from "@/components/ui/content";
import { WaitingOnNote } from "@/components/ui/blocker";

type MyWork = ViewData<"myWork">;

function Row({ children }: { children: React.ReactNode }) {
  return <li className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">{children}</li>;
}

function Title({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-sm font-medium leading-snug text-foreground hover:underline">
      {children}
    </Link>
  );
}

export function TasksTab({ tasks }: { tasks: MyWork["tasks"] }) {
  // Agents perform most tasks, so open on whichever side actually has work.
  const [relation, setRelation] = useState<"assigned_to_me" | "requested_by_me">(() =>
    tasks.some((t) => t.relation === "assigned_to_me" && t.status !== "Done" && t.status !== "Cancelled") ? "assigned_to_me" : "requested_by_me",
  );
  const [showCompleted, setShowCompleted] = useState(false);
  const inRelation = tasks.filter((t) => t.relation === relation);
  const closed = inRelation.filter((t) => t.status === "Done" || t.status === "Cancelled").length;
  const visible = showCompleted ? inRelation : inRelation.filter((t) => t.status !== "Done" && t.status !== "Cancelled");
  const count = (r: string) => tasks.filter((t) => t.relation === r && (showCompleted || (t.status !== "Done" && t.status !== "Cancelled"))).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <SegmentedControl
          size="small"
          value={relation}
          onValueChange={(v) => setRelation(v as typeof relation)}
          options={[
            { value: "assigned_to_me", label: `Assigned to me (${count("assigned_to_me")})` },
            { value: "requested_by_me", label: `Requested by me (${count("requested_by_me")})` },
          ]}
        />
        <Switch
          className="!mb-0"
          checked={showCompleted}
          onChange={(e) => setShowCompleted(e.currentTarget.checked)}
          label={`Show completed and cancelled${closed ? ` (${closed})` : ""}`}
        />
      </div>
      {visible.length === 0 ? (
        <EmptyState
          icon="tick-circle"
          title={relation === "assigned_to_me" ? "No open tasks assigned to you" : "No open tasks you're responsible for"}
          description={
            relation === "assigned_to_me"
              ? "Tasks where you're the expected performer appear here."
              : "Tasks agents opened from your requests, and tasks you remain responsible for, appear here."
          }
        />
      ) : (
        <ul className="divide-y">
          {visible.map((t) => (
            <Row key={t.id}>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Title href={`/tasks/${t.id}`}>{t.title}</Title>
                  <StatusTag kind="task" value={t.status} />
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    {t.performer_kind && <Avatar name={t.performer} kind={t.performer_kind === "agent" ? "agent" : "person"} size={16} />}
                    {t.performer}
                    {t.performer_kind === "agent" && " (agent)"}
                  </span>
                </div>
                {t.status !== "Done" && t.status !== "Cancelled" && <WaitingOnNote tasks={t.waiting_on} className="mt-1" />}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                Updated <Time iso={t.updated_at} />
              </span>
            </Row>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OutputsTab({ outputs }: { outputs: MyWork["outputs"] }) {
  if (!outputs.length) {
    return <EmptyState icon="document" title="No documents" description="Documents you own and documents shared with you appear here." />;
  }
  return (
    <ul className="divide-y">
      {outputs.map((o) => (
        <Row key={o.id}>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Title href={`/outputs/${o.id}`}>{o.title}</Title>
              <span className="font-mono text-[11px] text-muted-foreground">Version {o.version}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{o.relation}</span>
            </div>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            Updated <Time iso={o.updated_at} />
          </span>
        </Row>
      ))}
    </ul>
  );
}

export function AssignmentsTab({ assignments }: { assignments: MyWork["assignments"] }) {
  if (!assignments.length) {
    return (
      <EmptyState
        icon="predictive-analysis"
        title="No agent assignments"
        description="Agent work you started or remain responsible for appears here — task contributions and ongoing monitoring alike."
      />
    );
  }
  return (
    <ul className="divide-y">
      {assignments.map((a) => (
        <Row key={a.id}>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Title href={`/assignments/${a.id}`}>{a.purpose}</Title>
              <StatusTag kind="assignment" value={a.status} />
            </div>
            {a.waiting_on.length > 0 ? (
              <WaitingOnNote tasks={a.waiting_on} />
            ) : (
              a.condition && <p className="text-xs text-foreground/80">{a.condition}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Avatar name={a.agent} kind="agent" size={16} />
                {a.agent} (agent)
              </span>
              <span aria-hidden>·</span>
              <span>{a.relation}</span>
              <span aria-hidden>·</span>
              <span>{a.kind === "ongoing" ? "Ongoing" : "Task contribution"}</span>
            </div>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            Updated <Time iso={a.updated_at} />
          </span>
        </Row>
      ))}
    </ul>
  );
}
