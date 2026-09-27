"use client";

import Link from "next/link";
import { Icon } from "@blueprintjs/core";
import { useView, type ViewData } from "@/lib/api";
import { StatusTag } from "@/components/ui/status";
import { ErrorState, LoadingState, Panel } from "@/components/ui/layout";
import { ActivityList, Time } from "@/components/ui/content";
import { requestTypeInfo } from "@/components/requests/labels";
import { RequestPanel } from "@/components/requests/request-panel";
import { CaseContext } from "@/components/task/case-context";
import { AskInformationButton } from "@/components/task/ask-information-dialog";
import { TaskRequests } from "@/components/task/task-requests";
import { TaskActions } from "@/components/task/task-actions";
import { TaskComposer } from "@/components/task/task-composer";
import { CasePanel } from "@/components/task/case-panel";
import { cn } from "@/lib/utils";

type TaskView = ViewData<"task">;

export default function TaskPage({ params }: { params: { id: string } }) {
  const q = useView("task", { id: params.id });
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const open = d.task.status !== "Done" && d.task.status !== "Cancelled";

  return (
    <div className="mx-auto max-w-[830px] space-y-5">
      <TaskHeader d={d} />
      {d.kase && <CasePanel d={d} />}
      <ResultCard d={d} />
      {open && <ConditionsCard d={d} />}
      {open &&
        d.blocking.map((r) => (
          <Card key={r.id} label="Related request" flush>
            <div className="p-6">
              <RequestPanel requestId={r.id} embedded />
            </div>
          </Card>
        ))}
      <TaskComposer d={d} />
      <TaskRequests d={d} actions={open ? <AskInformationButton d={d} /> : undefined} />
      {d.kase && <CaseContext d={d} />}
      <Panel title="Activity" className="overflow-hidden rounded-3xl">
        <ActivityList items={d.activity} />
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header: title, where it stands, who is on it, and what you can do.
// ---------------------------------------------------------------------------

const STATUS: Record<string, { label: string; tone: string; dot: string }> = {
  Open: { label: "proposed", tone: "bg-brand/10 text-brand-strong", dot: "bg-brand-strong" },
  InProgress: { label: "in progress", tone: "bg-progress-soft text-progress", dot: "bg-progress" },
  InReview: { label: "submitted", tone: "bg-brand/10 text-brand-strong", dot: "bg-brand-strong" },
  Done: { label: "done", tone: "bg-ready-soft text-ready", dot: "bg-ready" },
  Cancelled: { label: "cancelled", tone: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
};

function DotPill({ label, tone, dot }: { label: string; tone: string; dot: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-medium", tone)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} aria-hidden />
      {label}
    </span>
  );
}

function TaskHeader({ d }: { d: TaskView }) {
  const t = d.task;
  const st = STATUS[t.status] ?? { label: t.status, tone: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" };
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 pb-1">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-display text-[32px] leading-tight text-balance">{t.title}</h1>
          <DotPill {...st} />
        </div>
        <p className="text-[15px] text-muted-foreground">
          {d.kase?.ref ? `${d.kase.ref} · ` : ""}Performer {d.performer ? `${d.performer}${t.performer_kind === "agent" ? " (agent)" : ""}` : "unassigned"} · Responsible {d.responsible} · Updated{" "}
          <Time iso={t.updated_at} />
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <TaskActions d={d} />
      </div>
    </header>
  );
}

function Card({ label, children, flush = false }: { label: string; children: React.ReactNode; flush?: boolean }) {
  return (
    <section className="overflow-hidden rounded-3xl border bg-card shadow-[0_1px_3px_rgb(28_26_24/0.04)]">
      <h2 className={cn("text-sm text-muted-foreground", flush ? "border-b px-5 py-3.5" : "px-5 pt-4")}>{label}</h2>
      {flush ? children : <div className="px-5 pb-5 pt-2">{children}</div>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Result: what the task should produce, and what it has produced so far.
// ---------------------------------------------------------------------------

function ResultCard({ d }: { d: TaskView }) {
  const t = d.task;
  return (
    <Card label="Result">
      <div className="space-y-3">
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
          {t.expected_result || <span className="text-muted-foreground">No expected result was written.</span>}
        </p>
        {d.output ? (
          <Link href={`/outputs/${d.output.id}`} className="flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors hover:bg-accent/60">
            <Icon icon="document" size={15} className="text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm">
              {d.output.title} <span className="text-muted-foreground">· version {d.output.version}</span>
            </span>
            {d.review && <StatusTag kind="review" value={d.review.status} />}
            <Icon icon="chevron-right" size={14} className="text-muted-foreground" aria-hidden />
          </Link>
        ) : (
          d.output_hidden && <p className="text-sm text-muted-foreground">This task has a document you can&apos;t open.</p>
        )}
        {t.result_note && (
          <div className="space-y-1 border-t pt-3">
            <p className="text-sm text-muted-foreground">Result note</p>
            <p className="whitespace-pre-wrap text-sm">{t.result_note}</p>
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Completion conditions: everything that must hold before the task can be completed.
// ---------------------------------------------------------------------------

function ConditionsCard({ d }: { d: TaskView }) {
  const t = d.task;
  const rows: { key: string; text: React.ReactNode; met: boolean; href?: string }[] = [];
  if (t.requires_review) rows.push({ key: "review", text: "All required reviewers accept the submitted version", met: t.review_satisfied });
  for (const u of d.unmet) rows.push({ key: u.id, text: <>“{u.title}” is done</>, met: false, href: `/tasks/${u.id}` });
  for (const r of d.blocking) {
    if (r.kind === "review" && t.requires_review) continue; // covered by the review condition
    rows.push({ key: r.id, text: <>{requestTypeInfo(r.kind).label} answered by {r.is_recipient ? "you" : r.recipient}</>, met: false });
  }
  if (!rows.length) return null;
  return (
    <Card label="Completion conditions">
      <ul className="divide-y">
        {rows.map((c) => (
          <li key={c.key} className="flex items-center justify-between gap-4 py-2.5 first:pt-1 last:pb-0">
            <span className="min-w-0 text-[15px]">{c.text}</span>
            <span className="flex shrink-0 items-center gap-3">
              <span className={cn("rounded-md px-1.5 py-0.5 text-[13px]", c.met ? "bg-ready-soft text-ready" : "bg-brand/10 text-brand-strong")}>{c.met ? "Met" : "Not met"}</span>
              {c.href && (
                <Link href={c.href} className="text-[15px] font-medium hover:underline">
                  Open
                </Link>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
