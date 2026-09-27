"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useView } from "@/lib/api";
import { ErrorState, LoadingState } from "@/components/ui/layout";
import { AuditTab, PeopleTab, RolesTab } from "@/components/admin/admin";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "people", label: "Organization and people" },
  { id: "roles", label: "Roles and access" },
  { id: "audit", label: "Audit" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function AdminPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Admin />
    </Suspense>
  );
}

function Admin() {
  const q = useView("admin");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("tab");
  const tab: TabId = TABS.some((t) => t.id === raw) ? (raw as TabId) : "people";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="font-display text-[32px] leading-tight">Administration</h1>

      <div role="tablist" aria-label="Administration sections" className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => router.replace(t.id === "people" ? pathname : `${pathname}?tab=${t.id}`, { scroll: false })}
            className={cn(
              "-mb-px border-b-2 px-3 pb-2.5 pt-1 text-[15px] transition-colors",
              tab === t.id ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {q.isPending ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : tab === "people" ? (
        <PeopleTab d={q.data} />
      ) : tab === "roles" ? (
        <RolesTab d={q.data} />
      ) : (
        <AuditTab d={q.data} />
      )}
    </div>
  );
}
