"use client";

import { useView } from "@/lib/api";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui/layout";
import { ConnectionDetail } from "@/components/connections/connection-detail";
import { HealthPill } from "@/components/connections/connections";

export default function ConnectionPage({ params }: { params: { id: string } }) {
  const q = useView("connection", { id: params.id });
  if (q.isPending) return <LoadingState className="mx-auto max-w-7xl" />;
  if (q.isError)
    return (
      <div className="mx-auto max-w-7xl">
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </div>
    );
  const d = q.data;
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        back={{ href: "/connections", label: "Connections" }}
        eyebrow="Connection"
        title={d.connection.name}
        subtitle={d.connection.description}
        meta={<HealthPill c={d.connection} />}
      />
      <ConnectionDetail d={d} />
    </div>
  );
}
