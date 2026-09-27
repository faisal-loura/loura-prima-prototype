"use client";

import { useView } from "@/lib/api";
import { ErrorState, LoadingState } from "@/components/ui/layout";
import { ConnectionsList } from "@/components/connections/connections";

export default function ConnectionsPage() {
  const q = useView("connections");
  return (
    <div className="mx-auto max-w-[830px] space-y-8">
      <header className="space-y-2">
        <h1 className="font-display text-[32px] leading-tight">External connections</h1>
        <p className="text-[15px] text-muted-foreground">
          Systems Loura can read, receive updates from, or propose changes to — and whether it can observe them right now.
        </p>
      </header>
      {q.isPending ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <ConnectionsList d={q.data} />}
    </div>
  );
}
