"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HTMLSelect, Icon, InputGroup, Tooltip } from "@blueprintjs/core";
import { useView, type ViewData } from "@/lib/api";
import { ErrorState, LoadingState } from "@/components/ui/layout";
import { Time } from "@/components/ui/content";
import { cn } from "@/lib/utils";

type Data = ViewData<"controlRoom">;
type QueueRow = Data["queue"][number];

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "queue", label: "Queue" },
  { id: "assignments", label: "Open Cases" },
  { id: "usage", label: "Usage and limits" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** Tones for the chart series, so a colour always means the same thing here. */
const TONE: Record<string, { fg: string; bg: string; hex: string }> = {
  Succeeded: { fg: "text-ready", bg: "bg-ready", hex: "rgb(var(--ready))" },
  Failed: { fg: "text-blocked", bg: "bg-blocked", hex: "rgb(var(--blocked))" },
  Waiting: { fg: "text-brand-strong", bg: "bg-brand-strong", hex: "rgb(var(--brand-strong))" },
  "In progress": { fg: "text-progress", bg: "bg-progress", hex: "rgb(var(--progress))" },
  Active: { fg: "text-ready", bg: "bg-ready", hex: "rgb(var(--ready))" },
  Ended: { fg: "text-unknown", bg: "bg-unknown", hex: "rgb(var(--unknown))" },
};
const tone = (label: string) => TONE[label] ?? { fg: "text-brand-strong", bg: "bg-brand-strong", hex: "rgb(var(--brand-strong))" };

export default function ControlRoomPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ControlRoom />
    </Suspense>
  );
}

function ControlRoom() {
  const q = useView("controlRoom", undefined, { poll: 10000 });
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("tab");
  const tab: TabId = TABS.some((t) => t.id === raw) ? (raw as TabId) : "overview";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="font-display text-[32px] leading-tight">Control Room</h1>

      <div role="tablist" aria-label="Control Room sections" className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => router.replace(t.id === "overview" ? pathname : `${pathname}?tab=${t.id}`, { scroll: false })}
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
      ) : tab === "overview" ? (
        <Overview d={q.data} />
      ) : tab === "queue" ? (
        <Queue d={q.data} />
      ) : tab === "assignments" ? (
        <OpenCases d={q.data} />
      ) : (
        <Usage d={q.data} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function Card({ title, hint, children, className }: { title?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-3xl border bg-card p-5 shadow-[0_1px_3px_rgb(28_26_24/0.04)]", className)}>
      {title && (
        <h2 className="flex items-center gap-1.5 pb-3 text-[15px] font-medium">
          {title}
          {hint && (
            <Tooltip content={<span className="block max-w-64 text-xs">{hint}</span>} placement="top" minimal>
              <Icon icon="info-sign" size={12} className="text-muted-foreground" aria-label={hint} />
            </Tooltip>
          )}
        </h2>
      )}
      {children}
    </section>
  );
}

function Stat({ title, hint, value, unit, caption }: { title: string; hint?: string; value: number | string; unit?: string; caption: string }) {
  return (
    <Card title={title} hint={hint}>
      <p className="text-[40px] leading-none">
        {value}
        {unit && <span className="text-[20px] text-muted-foreground">{unit}</span>}
      </p>
      <p className="pt-3 text-sm text-muted-foreground">{caption}</p>
    </Card>
  );
}

/** A ring of the series, with the total in the middle. */
function Donut({ series, unit }: { series: { label: string; value: number }[]; unit: string }) {
  const total = series.reduce((n, s) => n + s.value, 0);
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 140 140" className="h-[140px] w-[140px] shrink-0" role="img" aria-label={series.map((s) => `${s.label}: ${s.value}`).join(", ")}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgb(var(--muted))" strokeWidth="22" />
        {total > 0 &&
          series
            .filter((s) => s.value > 0)
            .map((s) => {
              const len = (s.value / total) * c;
              const dash = <circle key={s.label} cx="70" cy="70" r={r} fill="none" stroke={tone(s.label).hex} strokeWidth="22" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)" />;
              offset += len;
              return dash;
            })}
        <text x="70" y="68" textAnchor="middle" className="fill-foreground text-[26px]">
          {total}
        </text>
        <text x="70" y="86" textAnchor="middle" className="fill-current text-[11px] text-muted-foreground">
          {unit}
        </text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-2.5">
        {series.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-[15px]">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", tone(s.label).bg)} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            <span className="tabular text-muted-foreground">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bars({ series }: { series: { label: string; value: number }[] }) {
  const max = Math.max(1, ...series.map((s) => s.value));
  return (
    <ul className="space-y-2.5">
      {series.map((s) => (
        <li key={s.label} className="grid grid-cols-[minmax(90px,auto)_1fr_auto] items-center gap-3 text-[15px]">
          <span className="truncate text-muted-foreground">{s.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span className={cn("block h-full rounded-full", tone(s.label).bg)} style={{ width: `${(s.value / max) * 100}%` }} />
          </span>
          <span className="tabular w-6 text-right">{s.value}</span>
        </li>
      ))}
    </ul>
  );
}

function StateTag({ state, blocked }: { state: string; blocked: boolean }) {
  return (
    <span className={cn("inline-block rounded-md px-2 py-0.5 text-[13px] font-medium", blocked ? "bg-blocked-soft text-blocked" : "bg-brand/10 text-brand-strong")}>{state}</span>
  );
}

function actionFor(row: QueueRow) {
  if (row.request_id && row.is_recipient) return { label: "Review", href: `/?request=${row.request_id}` };
  return { label: "Open case", href: `/tasks/${row.id}` };
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function Overview({ d }: { d: Data }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Needs attention" className="!p-0 lg:row-span-2">
        {d.attention.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Nothing is waiting on a person right now.</p>
        ) : (
          <ul className="divide-y">
            {d.attention.map((row) => {
              const a = actionFor(row);
              return (
                <li key={row.id} className="flex items-start justify-between gap-3 p-5">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-[15px] font-medium leading-snug">{row.title}</p>
                    <p className="text-sm text-muted-foreground">{row.next_step}</p>
                    <p className="text-sm text-muted-foreground">
                      {row.next_detail} · waiting <Time iso={row.since} />
                    </p>
                  </div>
                  <Link href={a.href} className="shrink-0 rounded-full border bg-card px-3.5 py-1.5 text-[13px] font-medium transition-colors hover:bg-accent">
                    {a.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Cases by status" hint="Cases that aren't completed or cancelled, grouped by where they stand.">
        <Donut series={d.cases_by_state} unit="cases" />
      </Card>

      <Card title="Time in current stage" hint="How long each open case has gone without a change.">
        <Bars series={d.stage_age} />
      </Card>

      <Card title="Blockers" hint="What open cases are waiting on.">
        {d.blockers.length === 0 ? <p className="text-sm text-muted-foreground">No case is blocked.</p> : <Bars series={d.blockers} />}
      </Card>

      <Stat title="Completed cases" value={d.completed} caption="Currently closed" />

      <Card title="Usage and limits" hint="Agent runs in the last 30 days, and how many assignments are running now." className="lg:col-start-2 lg:col-span-2">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-[32px] leading-none">{d.usage.runs}</p>
            <p className="text-sm text-muted-foreground">Agent runs this period</p>
            <span className="block h-2 rounded-full bg-brand-strong" aria-hidden />
          </div>
          <div className="space-y-2">
            <p className="text-[32px] leading-none">
              {d.usage.assignments_active}
              <span className="text-[18px] text-muted-foreground">/{d.usage.assignments_total}</span>
            </p>
            <p className="text-sm text-muted-foreground">Assignments active</p>
            <span className="block h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span
                className="block h-full rounded-full bg-ready"
                style={{ width: `${d.usage.assignments_total ? (d.usage.assignments_active / d.usage.assignments_total) * 100 : 0}%` }}
              />
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Queue: every case waiting on a person
// ---------------------------------------------------------------------------

function Queue({ d }: { d: Data }) {
  const [text, setText] = useState("");
  const [state, setState] = useState("All");
  const [sort, setSort] = useState<"urgent" | "recent">("urgent");
  const states = ["All", ...new Set(d.queue.map((r) => r.state))];

  const rows = d.queue
    .filter((r) => (state === "All" || r.state === state) && (r.title + r.short_id + r.next_step).toLowerCase().includes(text.trim().toLowerCase()))
    .slice()
    .sort((a, b) => (sort === "urgent" ? a.since.localeCompare(b.since) : b.since.localeCompare(a.since)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <InputGroup leftIcon="search" placeholder="Search cases…" value={text} onChange={(e) => setText(e.currentTarget.value)} aria-label="Search cases" className="w-[min(100%,260px)]" />
        <span className="text-sm text-muted-foreground">
          {rows.length} {rows.length === 1 ? "case" : "cases"}
        </span>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Status:
          <HTMLSelect minimal value={state} onChange={(e) => setState(e.currentTarget.value)} options={states} />
        </label>
        <div className="ml-auto">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Sort:
            <HTMLSelect
              minimal
              value={sort}
              onChange={(e) => setSort(e.currentTarget.value as "urgent" | "recent")}
              options={[
                { value: "urgent", label: "Most urgent" },
                { value: "recent", label: "Most recent" },
              ]}
            />
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border bg-card">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-muted/60 text-sm text-muted-foreground">
              <th scope="col" className="px-5 py-3 font-normal">Case</th>
              <th scope="col" className="px-5 py-3 font-normal">Status</th>
              <th scope="col" className="px-5 py-3 font-normal">Next step</th>
              <th scope="col" className="px-5 py-3 font-normal">Waiting</th>
              <th scope="col" className="px-5 py-3 font-normal">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No case is waiting on a person.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const a = actionFor(row);
                return (
                  <tr key={row.id} className="align-middle">
                    <td className="px-5 py-4">
                      <Link href={`/tasks/${row.id}`} className="block text-[15px] font-medium hover:underline">
                        {row.title}
                      </Link>
                      <span className="text-sm text-muted-foreground">{row.short_id}</span>
                    </td>
                    <td className="px-5 py-4">
                      <StateTag state={row.state} blocked={row.blocked} />
                    </td>
                    <td className="px-5 py-4">
                      <span className="block text-[15px]">{row.next_step}</span>
                      <span className="text-sm text-muted-foreground">{row.next_detail}</span>
                    </td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">
                      <Time iso={row.since} />
                    </td>
                    <td className="px-5 py-4">
                      <Link href={a.href} className="inline-block rounded-full border bg-card px-3.5 py-1.5 text-[13px] font-medium transition-colors hover:bg-accent">
                        {a.label}
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Open Cases: the agent assignments working on them
// ---------------------------------------------------------------------------

function OpenCases({ d }: { d: Data }) {
  const [state, setState] = useState("All");
  const states = ["All", ...new Set(d.assignments.map((a) => a.status))];
  const rows = d.assignments.filter((a) => state === "All" || a.status === state);
  const active = d.assignments.filter((a) => a.status === "Active").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {active} active · {d.assignments.length} total
        </span>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Status:
          <HTMLSelect minimal value={state} onChange={(e) => setState(e.currentTarget.value)} options={states} />
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-3xl border border-dashed px-5 py-8 text-center text-sm text-muted-foreground">No agent assignments yet.</p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-3xl border bg-card">
          {rows.map((a) => (
            <li key={a.id}>
              <Link href={`/assignments/${a.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-accent/60">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{a.purpose}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {a.case ? `${a.case.short_id} · ` : ""}Responsible {a.responsible}
                  </span>
                </span>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-medium",
                    a.status === "Active" ? "bg-ready-soft text-ready" : "bg-muted text-muted-foreground",
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", a.status === "Active" ? "bg-ready" : "bg-muted-foreground")} aria-hidden />
                  {a.status.toLowerCase()}
                </span>
                <Icon icon="chevron-right" size={14} className="shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Usage and limits
// ---------------------------------------------------------------------------

function Usage({ d }: { d: Data }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Stat title="Agent runs this period" value={d.usage.runs} caption="Across all agent assignments, last 30 days" />
        <Stat title="Seats used" value={d.usage.seats} caption="People with access in this prototype" />
        <Stat title="Assignments active" value={d.usage.assignments_active} unit={`/${d.usage.assignments_total}`} caption="Currently running" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Runs by outcome" hint="Every agent run started in the last 30 days.">
          <Donut series={d.usage.runs_by_outcome} unit="runs" />
        </Card>
        <Card title="Assignments by status" hint="Every agent assignment you can see, by its current status.">
          <Bars series={d.usage.assignments_by_status} />
        </Card>
      </div>
    </div>
  );
}
