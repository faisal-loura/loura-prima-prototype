"use client";

import { useView } from "@/lib/api";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui/layout";
import { Pill } from "@/components/ui/status";
import { SourceDetail } from "@/components/sources/source-detail";

export default function SourcePage({ params }: { params: { id: string } }) {
  const q = useView("source", { id: params.id });
  if (q.isPending) return <LoadingState className="mx-auto max-w-6xl" />;
  if (q.isError)
    return (
      <div className="mx-auto max-w-6xl">
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </div>
    );
  const d = q.data;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back={{ href: "/sources", label: "Sources" }}
        eyebrow={d.source.kind === "record" ? "Record source" : "Document source"}
        title={d.source.title}
        meta={
          <>
            <Pill tone="muted">Version {d.source.version}</Pill>
            {d.source.restricted && (
              <Pill tone="warn" icon="lock">
                Restricted
              </Pill>
            )}
          </>
        }
      />
      <SourceDetail d={d} />
    </div>
  );
}
