"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LoadingState } from "@/components/ui/layout";
import { OutputWorkspace } from "@/components/output/output-workspace";

export default function OutputPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={<LoadingState />}>
      <OutputPageContent id={params.id} />
    </Suspense>
  );
}

function OutputPageContent({ id }: { id: string }) {
  const search = useSearchParams();
  const raw = Number(search.get("version"));
  const version = Number.isInteger(raw) && raw > 0 ? raw : undefined;
  return <OutputWorkspace id={id} version={version} />;
}
