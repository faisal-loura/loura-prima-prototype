"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Collapse, Icon } from "@blueprintjs/core";
import { useView, type ViewData } from "@/lib/api";
import { ErrorState, LoadingState } from "@/components/ui/layout";
import { Time } from "@/components/ui/content";
import { cn } from "@/lib/utils";

type Item = ViewData<"recents">["items"][number];

const TABS = [
  { id: "all", label: "All" },
  { id: "thread", label: "Threads" },
  { id: "task", label: "Tasks" },
  { id: "output", label: "Outputs" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function RecentsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Recents />
    </Suspense>
  );
}

function Recents() {
  const q = useView("recents");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [completedOpen, setCompletedOpen] = useState(false);
  const raw = params.get("tab");
  const tab: TabId = TABS.some((t) => t.id === raw) ? (raw as TabId) : "all";

  const setTab = (id: TabId) => router.replace(id === "all" ? pathname : `${pathname}?tab=${id}`, { scroll: false });

  const items = (q.data?.items ?? []).filter((i) => tab === "all" || i.kind === tab);
  const active = items.filter((i) => !i.completed);
  const completed = items.filter((i) => i.completed);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="font-display text-[32px] leading-tight">Recents</h1>

      <div role="tablist" aria-label="Filter recents" className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[15px] transition-colors",
              tab === t.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {q.isPending ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="space-y-3">
          {active.length === 0 && completed.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">Nothing here yet. Threads, tasks, and outputs you work on appear here.</p>
          ) : (
            <ul aria-label="Recent items">
              {active.map((i) => (
                <Row key={`${i.kind}-${i.id}`} item={i} />
              ))}
            </ul>
          )}

          {completed.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setCompletedOpen((v) => !v)}
                aria-expanded={completedOpen}
                aria-controls="recents-completed"
                className="flex w-full items-center justify-between rounded-lg py-2 text-[15px] text-muted-foreground hover:text-foreground"
              >
                Completed ({completed.length})
                <Icon icon={completedOpen ? "chevron-up" : "chevron-down"} size={14} aria-hidden />
              </button>
              <Collapse isOpen={completedOpen}>
                <ul id="recents-completed" aria-label="Completed tasks">
                  {completed.map((i) => (
                    <Row key={`${i.kind}-${i.id}`} item={i} />
                  ))}
                </ul>
              </Collapse>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KindIcon({ item }: { item: Item }) {
  if (item.kind === "thread") return <Icon icon="chat" size={15} className="text-muted-foreground" aria-label="Thread" />;
  if (item.kind === "output") return <Icon icon="document" size={15} className="text-muted-foreground" aria-label="Output" />;
  if (item.completed) return <Icon icon="tick-circle" size={15} className="text-muted-foreground" aria-label="Completed task" />;
  return <span className="inline-block h-[15px] w-[15px] rounded-full bg-card ring-1 ring-border" role="img" aria-label="Task" />;
}

function Row({ item }: { item: Item }) {
  return (
    <li>
      <Link
        href={item.href}
        className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/70 focus-visible:bg-accent/70 focus-visible:outline-none"
      >
        <span className="flex w-4 shrink-0 justify-center">
          <KindIcon item={item} />
        </span>
        <span className={cn("min-w-0 flex-1 truncate text-[15px]", item.completed && "text-muted-foreground")}>{item.title}</span>
        <Time iso={item.updated_at} className="shrink-0 text-[13px] text-muted-foreground" />
      </Link>
    </li>
  );
}
