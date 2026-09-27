"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tab, Tabs } from "@blueprintjs/core";
import { useView } from "@/lib/api";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui/layout";
import { AssignmentsTab, OutputsTab, TasksTab } from "@/components/my-work/lists";

const TABS = ["tasks", "outputs", "assignments"] as const;
type TabId = (typeof TABS)[number];

export default function MyWorkPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <MyWork />
    </Suspense>
  );
}

function MyWork() {
  const q = useView("myWork");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("tab");
  const tab: TabId = (TABS as readonly string[]).includes(raw ?? "") ? (raw as TabId) : "tasks";

  const setTab = (id: TabId) => {
    const sp = new URLSearchParams(params.toString());
    if (id === "tasks") sp.delete("tab");
    else sp.set("tab", id);
    const s = sp.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="My Work"
        subtitle="Your tasks, documents, and the work you've delegated to agents."
      />
      {q.isPending ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="rounded-xl border bg-card">
          <div className="overflow-x-auto border-b px-4">
            <Tabs id="my-work-tabs" selectedTabId={tab} onChange={(id) => setTab(id as TabId)}>
              <Tab id="tasks" title="Tasks" tagContent={q.data.tasks.filter((t) => t.status !== "Done" && t.status !== "Cancelled").length} />
              <Tab id="outputs" title="Outputs" tagContent={q.data.outputs.length} />
              <Tab id="assignments" title="Agent assignments" tagContent={q.data.assignments.length} />
            </Tabs>
          </div>
          <div role="tabpanel" aria-label={tab}>
            {tab === "tasks" && <TasksTab tasks={q.data.tasks} />}
            {tab === "outputs" && <OutputsTab outputs={q.data.outputs} />}
            {tab === "assignments" && <AssignmentsTab assignments={q.data.assignments} />}
          </div>
        </div>
      )}
    </div>
  );
}
