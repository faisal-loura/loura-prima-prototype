"use client";

import { useState } from "react";
import Image from "next/image";
import { Button, Collapse, HTMLSelect, Icon, Spinner, TextArea } from "@blueprintjs/core";
import { useOp, type ViewData } from "@/lib/api";
import { cn } from "@/lib/utils";

type TaskView = ViewData<"task">;
type Kase = NonNullable<TaskView["kase"]>;
type Step = Kase["steps"][number];

const STATUS: Record<string, { label: string; tone: string }> = {
  NotStarted: { label: "Not started", tone: "bg-muted text-muted-foreground" },
  InProgress: { label: "In progress", tone: "bg-progress-soft text-progress" },
  Done: { label: "Done", tone: "bg-ready-soft text-ready" },
  Blocked: { label: "Blocked", tone: "bg-blocked-soft text-blocked" },
  Skipped: { label: "Skipped", tone: "bg-muted text-muted-foreground" },
};

// A case kind without alternative paths leaves `paths` empty: every step applies.
const applies = (s: Step, path: string | null) => !path || s.paths.length === 0 || s.paths.includes(path);

export function CasePanel({ d }: { d: TaskView }) {
  const k = d.kase;
  const [open, setOpen] = useState<number | null>(null);
  if (!k) return null;

  const stages = [...new Map(k.steps.map((s) => [s.stage_no, { no: s.stage_no, name: s.stage_name }])).values()];
  const live = k.steps.filter((s) => applies(s, k.path));
  const done = live.filter((s) => s.status === "Done" || s.status === "Skipped").length;
  const closed = d.task.status === "Done" || d.task.status === "Cancelled";

  return (
    <section className="overflow-hidden rounded-3xl border bg-card shadow-[0_1px_3px_rgb(28_26_24/0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-medium">{k.procedure}</h2>
          <p className="text-sm text-muted-foreground">
            {k.ref ? `${k.ref} · ` : ""}
            {done} of {live.length} steps recorded · one case, seven stages
          </p>
        </div>
      </div>

      {k.working ? <WorkingStrip working={k.working} /> : <CaseStanding d={d} />}

      <ul className="divide-y">
        {stages.map((stage) => {
          const steps = k.steps.filter((s) => s.stage_no === stage.no);
          const inPath = steps.filter((s) => applies(s, k.path));
          const stageDone = inPath.length > 0 && inPath.every((s) => s.status === "Done" || s.status === "Skipped");
          const isOpen = open === stage.no || (k.working?.stage_no === stage.no && open === null) || (open === null && inPath.some((s) => s.status !== "Done" && s.status !== "Skipped") && stage.no === firstOpenStage(k));
          return (
            <li key={stage.no}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? -1 : stage.no)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-accent/50"
              >
                <Icon icon={isOpen ? "chevron-down" : "chevron-right"} size={14} className="shrink-0 text-muted-foreground" aria-hidden />
                <span className={cn("min-w-0 flex-1 text-[15px]", inPath.length === 0 && "text-muted-foreground")}>
                  Stage {stage.no} · {stage.name}
                </span>
                {inPath.length === 0 ? (
                  <span className="shrink-0 text-sm text-muted-foreground">Not needed</span>
                ) : (
                  <span className={cn("shrink-0 text-sm", stageDone ? "text-ready" : "text-muted-foreground")}>
                    {inPath.filter((s) => s.status === "Done" || s.status === "Skipped").length}/{inPath.length}
                  </span>
                )}
              </button>
              <Collapse isOpen={isOpen}>
                <ul className="divide-y border-t">
                  {steps.map((s) => (
                    <StepRow key={s.id} step={s} path={k.path} disabled={closed} working={k.working?.step_no === s.step_no} />
                  ))}
                </ul>
              </Collapse>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Shown while the case is working out the next stage. */
function WorkingStrip({ working }: { working: NonNullable<Kase["working"]> }) {
  return (
    <div className="space-y-2.5 border-b bg-brand/5 px-5 py-4">
      <p className="flex items-center gap-2.5 text-[15px]">
        <Spinner size={16} />
        <span className="font-medium">{working.note}</span>
      </p>
      {working.systems.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {working.systems.map((sys) => (
            <li key={sys.name} className="inline-flex items-center gap-2 rounded-full border bg-card py-1 pl-1.5 pr-3">
              {sys.logo ? (
                <Image src={sys.logo} alt="" width={18} height={18} unoptimized className="h-[18px] w-[18px] rounded object-contain" />
              ) : (
                <Icon icon="database" size={13} className="ml-1 text-muted-foreground" aria-hidden />
              )}
              <span className="text-[13px]">
                <span className="font-medium">{sys.name}</span>
                <span className="text-muted-foreground"> · {sys.detail}</span>
              </span>
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand-strong" aria-hidden />
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Reading records · the connected systems are sandbox stand-ins in this prototype.</p>
    </div>
  );
}

/** What the system worked out, and whose decision the case is waiting on. */
function CaseStanding({ d }: { d: TaskView }) {
  const k = d.kase!;
  const f = (k.facts ?? {}) as Record<string, unknown>;
  const gate = d.blocking[0];
  const short = (f.material_short ?? {}) as Record<string, { short: number; unit: string }>;
  const figures: [string, string][] = [];
  if (f.fg_gap !== undefined) figures.push(["Finished goods", `${Number(f.fg_reserved ?? 0)} in stock · ${Number(f.fg_gap)} to produce`]);
  if (Object.keys(short).length) figures.push(["Materials short", Object.entries(short).map(([n, v]) => `${n} ${v.short} ${v.unit}`).join(" · ")]);
  if (f.purchase_total !== undefined) figures.push(["Materials to buy", `SAR ${Number(f.purchase_total).toLocaleString("en-GB")}`]);
  if (!gate && !figures.length) return null;

  return (
    <div className="space-y-2 border-b bg-muted/40 px-5 py-4">
      {gate && (
        <p className="text-[15px]">
          <span className="font-medium">Waiting on {gate.is_recipient ? "you" : gate.recipient}</span>
          {" — "}
          {gate.question}
        </p>
      )}
      {figures.length > 0 && (
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          {figures.map(([label, value]) => (
            <div key={label} className="flex gap-1.5">
              <dt>{label}:</dt>
              <dd className="text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {gate && <p className="text-sm text-muted-foreground">The decision is in the request below; approving it records this stage and opens the next one.</p>}
    </div>
  );
}

function firstOpenStage(k: Kase) {
  const next = k.steps.find((s) => applies(s, k.path) && s.status !== "Done" && s.status !== "Skipped");
  return next?.stage_no ?? 1;
}

function StepRow({ step, path, disabled, working }: { step: Step; path: string | null; disabled: boolean; working: boolean }) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(step.status);
  const [note, setNote] = useState(step.note);
  const save = useOp("setCaseStep", { success: `Step ${step.step_no} recorded` });
  const off = !applies(step, path);
  const tone = STATUS[step.status] ?? STATUS.NotStarted;

  return (
    <li className={cn("px-5 py-3.5", off && "opacity-55")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[15px] leading-snug">
            <span className="tabular text-muted-foreground">{step.step_no}. </span>
            {step.title}
          </p>
          <p className="text-sm text-muted-foreground">
            {step.owner_role}
            {step.tools && step.tools !== "—" ? ` · ${step.tools}` : ""}
            {off ? " · not needed for this order" : ""}
            {step.confidence === "unclear" && !off && " · how this works isn't recorded yet"}
          </p>
          {step.note && <p className="text-sm">{step.note}</p>}
          {step.updated_by_name && step.status !== "NotStarted" && <p className="text-xs text-muted-foreground">Recorded by {step.updated_by_name}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {working ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-brand/10 px-2 py-0.5 text-[13px] font-medium text-brand-strong">
              <Spinner size={12} />
              Working
            </span>
          ) : (
            <span className={cn("rounded-md px-2 py-0.5 text-[13px] font-medium", off ? "bg-muted text-muted-foreground" : tone.tone)}>
              {off ? "Not applicable" : tone.label}
            </span>
          )}
          {!off && !disabled && (
            <Button variant="minimal" size="small" icon={editing ? "cross" : "edit"} aria-label={editing ? "Cancel" : `Record step ${step.step_no}`} onClick={() => setEditing((v) => !v)} />
          )}
        </div>
      </div>

      <Collapse isOpen={editing}>
        <div className="space-y-2 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <HTMLSelect
              value={status}
              onChange={(e) => setStatus(e.currentTarget.value as Step["status"])}
              options={Object.entries(STATUS).map(([value, v]) => ({ value, label: v.label }))}
              aria-label="Step status"
            />
            <span className="text-xs text-muted-foreground">What is recorded here is the case&apos;s state — the agent never sets it.</span>
          </div>
          <TextArea fill rows={2} value={note} onChange={(e) => setNote(e.currentTarget.value)} placeholder="What happened, and anything still unconfirmed" aria-label="Step note" />
          <div className="flex gap-2">
            <Button
              intent="primary"
              size="small"
              text="Record step"
              loading={save.isPending}
              onClick={() => save.mutate({ step_id: step.id, status, note }, { onSuccess: () => setEditing(false) })}
            />
            <Button variant="minimal" size="small" text="Cancel" onClick={() => setEditing(false)} />
          </div>
        </div>
      </Collapse>
    </li>
  );
}
