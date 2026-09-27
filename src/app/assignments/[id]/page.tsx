"use client";

import { useView } from "@/lib/api";
import { ErrorState, LoadingState, Panel } from "@/components/ui/layout";
import { ActivityList } from "@/components/ui/content";
import { AssignmentHeader } from "@/components/assignment/header";
import { ScopePanel } from "@/components/assignment/scope-panel";
import { ObservationPanel } from "@/components/assignment/observation-panel";
import { ResultPanel } from "@/components/assignment/result-panel";
import { ActionsPanel } from "@/components/assignment/actions-panel";
import { RunsPanel } from "@/components/assignment/runs-panel";
import { EventsPanel, RequestsPanel } from "@/components/assignment/events-panel";

export default function AssignmentPage({ params }: { params: { id: string } }) {
  const q = useView("assignment", { id: params.id });
  if (q.isPending) return <LoadingState className="mx-auto max-w-7xl" />;
  if (q.isError) return <div className="mx-auto max-w-7xl"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>;
  const d = q.data;

  return (
    <div className="mx-auto max-w-7xl">
      <AssignmentHeader d={d} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <ResultPanel d={d} />
          <ActionsPanel d={d} />
          <RunsPanel d={d} />
          <EventsPanel d={d} />
        </div>
        <div className="min-w-0 space-y-4">
          <ObservationPanel d={d} />
          <ScopePanel d={d} />
          <RequestsPanel d={d} />
          <Panel title="Activity">
            <ActivityList items={d.activity} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
