"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Collapse, Icon } from "@blueprintjs/core";
import { useView } from "@/lib/api";
import { ErrorState, LoadingState } from "@/components/ui/layout";
import { Time } from "@/components/ui/content";
import { AskComposer } from "@/components/home/ask-composer";
import { useShell } from "@/components/shell/shell-context";
import { CreateCaseDialog, CreateDocumentDialog } from "@/components/home/create-dialogs";
import { RequestPanel } from "@/components/requests/request-panel";
import type { RequestSummary } from "@/components/requests/request-row";
import { cn } from "@/lib/utils";

export default function HomePage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const q = useView("home");
  const shell = useShell();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [creating, setCreating] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(true);

  const requested = params.get("create");
  const selected = params.get("request");

  const [openingCase, setOpeningCase] = useState(false);

  useEffect(() => {
    if (requested === "document") setCreating(true);
    if (requested === "case") setOpeningCase(true);
  }, [requested]);

  const setRequest = useCallback(
    (id: string | null) => {
      const sp = new URLSearchParams(params.toString());
      if (id) sp.set("request", id);
      else sp.delete("request");
      const s = sp.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setRequest(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, setRequest]);

  const close = () => {
    setCreating(false);
    setOpeningCase(false);
    if (requested) router.replace(pathname);
  };

  const dialogs = (
    <>
      <CreateDocumentDialog isOpen={creating} onClose={close} />
      <CreateCaseDialog isOpen={openingCase} onClose={close} />
    </>
  );
  const firstName = shell?.me.full_name.split(" ")[0];

  return (
    <div className="mx-auto max-w-[680px] space-y-8 pt-2 md:pt-4">
      <section aria-labelledby="home-heading" className="space-y-6">
        <h1 id="home-heading" className="font-display text-4xl leading-tight md:text-[40px]">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}.
        </h1>
        <AskComposer />
      </section>

      {q.isPending ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <section aria-labelledby="inbox-heading" className="space-y-3">
          <button
            type="button"
            id="inbox-heading"
            onClick={() => setInboxOpen((v) => !v)}
            aria-expanded={inboxOpen}
            aria-controls="home-inbox"
            className="inline-flex items-center gap-2 rounded-md px-0.5 text-[15px] text-muted-foreground hover:text-foreground"
          >
            <Icon icon={inboxOpen ? "chevron-down" : "chevron-right"} size={14} aria-hidden />
            Inbox ({q.data.needs_total})
          </button>
          <Collapse isOpen={inboxOpen} keepChildrenMounted>
            <div id="home-inbox">
              {q.data.needs.length === 0 ? (
                <p className="rounded-2xl border border-dashed px-5 py-6 text-sm text-muted-foreground">Nothing needs your response right now.</p>
              ) : (
                <ul className="space-y-2.5" aria-label="Requests that need your response">
                  {q.data.needs.map((r) => (
                    <InboxCard key={r.id} item={r} selected={r.id === selected} onSelect={setRequest} />
                  ))}
                </ul>
              )}
            </div>
          </Collapse>
        </section>
      )}

      {selected && (
        <aside
          aria-label="Selected request"
          className="fixed inset-y-2 left-2 right-2 z-50 overflow-y-auto rounded-[28px] border bg-card p-6 shadow-[0_24px_60px_-16px_rgb(28_26_24/0.22)] animate-in slide-in-from-right-4 fade-in-0 duration-200 sm:left-auto sm:w-[min(460px,calc(100vw-1rem))]"
        >
          <RequestPanel requestId={selected} onClose={() => setRequest(null)} />
        </aside>
      )}
      {dialogs}
    </div>
  );
}

const KIND_CHIP: Record<string, { label: string; tone: string }> = {
  authorization: { label: "Action authorization", tone: "bg-muted text-muted-foreground" },
  task: { label: "Task approval", tone: "bg-muted text-muted-foreground" },
  information: { label: "Information", tone: "bg-progress-soft text-progress" },
  review: { label: "Output review", tone: "bg-brand/10 text-brand-strong" },
};

function InboxCard({ item, selected, onSelect }: { item: RequestSummary; selected: boolean; onSelect: (id: string) => void }) {
  const chip = KIND_CHIP[item.kind] ?? { label: item.kind, tone: "bg-muted text-muted-foreground" };
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(item.id)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex w-full flex-col gap-1.5 rounded-2xl border bg-card px-4 py-3.5 text-left shadow-[0_1px_3px_rgb(28_26_24/0.04)] transition-colors hover:border-input focus-visible:border-input focus-visible:outline-none",
          selected && "border-input ring-1 ring-input",
        )}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[12px] leading-4", chip.tone)}>{chip.label}</span>
            <span className="min-w-0 text-[15px] font-medium leading-snug text-foreground">{item.subject}</span>
          </span>
          {item.status === "Open" && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand/10 px-2 py-0.5 text-[12px] font-medium text-brand-strong">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-strong" aria-hidden />
              pending
            </span>
          )}
        </span>
        <span className="line-clamp-1 text-sm text-foreground/80">{item.question}</span>
        <span className="text-xs text-muted-foreground">
          {item.requester} · <Time iso={item.created_at} />
        </span>
      </button>
    </li>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
