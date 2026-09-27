"use client";

import { useView } from "@/lib/api";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui/layout";
import { StartAssignmentForm } from "@/components/assignment/start-form";

export default function NewAssignmentPage() {
  // Options load once; the form keeps its own state while you fill it in.
  const q = useView("startOptions", undefined, { poll: false });
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back={{ href: "/my-work?tab=assignments", label: "Agent assignments" }}
        eyebrow="Ongoing agent assignment"
        title="Start assignment"
        subtitle="Ask an agent to follow a connected record and keep an assessment current. You stay responsible for it."
      />
      {q.isPending ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <StartAssignmentForm options={q.data} />}
    </div>
  );
}
