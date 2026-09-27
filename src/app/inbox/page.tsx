"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, Collapse, Tab, Tabs } from "@blueprintjs/core";
import { useView } from "@/lib/api";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/layout";
import { RequestPanel } from "@/components/requests/request-panel";
import { RequestRow } from "@/components/requests/request-row";
import { UpdatesList } from "@/components/requests/updates-list";
import { cn } from "@/lib/utils";

export default function InboxPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Inbox />
    </Suspense>
  );
}

type TabId = "needs" | "updates";

function Inbox() {
  const q = useView("inbox");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const selected = params.get("request");
  const tab: TabId = params.get("tab") === "updates" ? "updates" : "needs";
  const [historyOpen, setHistoryOpen] = useState(false);
  const listScroll = useRef(0);

  const setParams = useCallback(
    (next: { request?: string | null; tab?: TabId }) => {
      const sp = new URLSearchParams(params.toString());
      if (next.request !== undefined) {
        if (next.request) sp.set("request", next.request);
        else sp.delete("request");
      }
      if (next.tab !== undefined) {
        if (next.tab === "updates") sp.set("tab", "updates");
        else sp.delete("tab");
      }
      const s = sp.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const select = (id: string) => {
    if (typeof window !== "undefined") listScroll.current = window.scrollY;
    setParams({ request: id });
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) window.scrollTo({ top: 0 });
  };

  const back = () => {
    setParams({ request: null });
    const y = listScroll.current;
    requestAnimationFrame(() => window.scrollTo({ top: y }));
  };

  // Open the history section when the selected request lives there.
  const inHistory = Boolean(selected && q.data?.history.some((h) => h.id === selected));
  useEffect(() => {
    if (inHistory) setHistoryOpen(true);
  }, [inHistory]);

  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const unread = d.updates.filter((u) => !u.read_at).length;

  return (
    <div className="mx-auto max-w-7xl">
      <div className={cn(selected && "hidden lg:block")}>
        <PageHeader
          title="Inbox"
          subtitle="Requests that need your response, and updates about work you're involved in. They're kept apart: an update never answers a request."
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        <section aria-label="Inbox lists" className={cn("min-w-0 space-y-4", selected && "hidden lg:block")}>
          <div className="rounded-xl border bg-card">
            <div className="border-b px-4">
              <Tabs id="inbox-tabs" selectedTabId={tab} onChange={(id) => setParams({ tab: id as TabId })}>
                <Tab id="needs" title="Needs my response" tagContent={d.needs.length} />
                <Tab id="updates" title="Updates" tagContent={unread || undefined} />
              </Tabs>
            </div>

            {tab === "needs" ? (
              d.needs.length === 0 ? (
                <EmptyState
                  icon="tick-circle"
                  title="Nothing needs your response."
                  description="Questions, review requests, and action approvals addressed to you appear here."
                />
              ) : (
                <ul className="divide-y" aria-label="Requests that need your response">
                  {d.needs.map((r) => (
                    <RequestRow key={r.id} item={r} selected={r.id === selected} onSelect={select} />
                  ))}
                </ul>
              )
            ) : (
              <UpdatesList updates={d.updates} />
            )}
          </div>

          {tab === "needs" && (
            <div className="rounded-xl border bg-card">
              <Button
                variant="minimal"
                fill
                alignText="start"
                icon={historyOpen ? "chevron-down" : "chevron-right"}
                aria-expanded={historyOpen}
                aria-controls="inbox-history"
                className="!px-4 !py-3"
                onClick={() => setHistoryOpen((v) => !v)}
              >
                <span className="text-sm">Recently resolved</span>
                <span className="ml-2 text-xs text-muted-foreground">{d.history.length}</span>
              </Button>
              <Collapse isOpen={historyOpen}>
                <div id="inbox-history" className="border-t">
                  {d.history.length === 0 ? (
                    <p className="px-4 py-4 text-sm text-muted-foreground">No resolved, withdrawn, or replaced requests yet.</p>
                  ) : (
                    <ul className="divide-y" aria-label="Recently resolved requests">
                      {d.history.map((r) => (
                        <RequestRow key={r.id} item={r} selected={r.id === selected} onSelect={select} showStatus />
                      ))}
                    </ul>
                  )}
                </div>
              </Collapse>
            </div>
          )}
        </section>

        <section aria-label="Selected request" className={cn("min-w-0", !selected && "hidden lg:block")}>
          {selected && (
            <Button variant="minimal" size="small" icon="chevron-left" text="Back to Inbox" className="mb-3 lg:hidden" onClick={back} />
          )}
          <div className="rounded-3xl border bg-card p-6">
            {selected ? (
              <RequestPanel requestId={selected} onClose={back} />
            ) : (
              <EmptyState icon="select" title="Select a request" description="Its question, context, and the response you can give appear here." />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
