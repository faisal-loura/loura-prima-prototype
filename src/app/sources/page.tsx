"use client";

import { useView } from "@/lib/api";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui/layout";
import { AddSourceButton, SourcesList } from "@/components/sources/sources";

export default function SourcesPage() {
  const q = useView("sources");
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Knowledge"
        title="Sources"
        subtitle="Documents and records that conversations, tasks, and assignments rely on — with their version and when they were observed."
        actions={<AddSourceButton />}
      />
      {q.isPending ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <SourcesList d={q.data} />}
    </div>
  );
}
