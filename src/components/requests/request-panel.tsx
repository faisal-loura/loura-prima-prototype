"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button, Callout, Collapse, Dialog, FormGroup, InputGroup, TextArea } from "@blueprintjs/core";
import { useOp, useView, type ViewData } from "@/lib/api";
import { useShell } from "@/components/shell/shell-context";
import { StatusTag } from "@/components/ui/status";
import { EffectNote, ErrorState, KeyValue, LoadingState } from "@/components/ui/layout";
import { Avatar, Markdown, PersonSelect, RecordLink, Time } from "@/components/ui/content";
import { cn } from "@/lib/utils";
import { responseWords } from "./labels";
import { Evidence, TechnicalDetails, type EvidenceItem } from "./evidence";

type RequestView = ViewData<"request">;

/* Drafts survive switching between list and panel (e.g. on narrow screens). */
const drafts = new Map<string, Record<string, string>>();
const lastMessages = new Map<string, string>();

function useDraft(requestId: string, field: string, initial = "") {
  const [value, setValue] = useState(() => drafts.get(requestId)?.[field] ?? initial);
  const update = (v: string) => {
    setValue(v);
    drafts.set(requestId, { ...(drafts.get(requestId) ?? {}), [field]: v });
  };
  return [value, update] as const;
}

/** `embedded`: shown inside another page (e.g. a task), so the action footer doesn't stick to the window. */
export function RequestPanel({ requestId, onClose, embedded = false }: { requestId: string; onClose?: () => void; embedded?: boolean }) {
  const q = useView("request", { id: requestId });
  if (q.isPending) return <LoadingState rows={3} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return <RequestBody key={requestId} data={q.data} onClose={onClose} embedded={embedded} />;
}

function Section({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-2", className)}>
      <h3 className="text-[15px] font-medium text-foreground">{label}</h3>
      <div className="text-sm">{children}</div>
    </section>
  );
}

const humanize = (s: string) => {
  const t = s.replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Eyebrow and title for the panel header, by request kind. */
function headline(d: RequestView): { eyebrow: string; title: string } {
  const r = d.request;
  if (d.is_task_proposal) return { eyebrow: "Task approval", title: d.task?.title ?? r.question };
  if (r.gate_key) return { eyebrow: `Stage ${r.gate_stage} decision`, title: r.question };
  if (r.type === "authorization") return { eyebrow: "Proposed action", title: d.action ? humanize(d.action.operation) : r.question };
  if (r.type === "review") return { eyebrow: "Output review", title: d.output ? `${d.output.title} · version ${d.output.version}` : r.question };
  return { eyebrow: "Information needed", title: r.question };
}

type GateData = {
  evidence?: EvidenceItem[];
  technical?: { label: string; value: string }[];
  figures?: { label: string; value: string }[];
  materials?: { name: string; need: number; available: number; short: number; unit: string }[];
  rfqs?: {
    item: string;
    short: number;
    unit: string;
    supplier: string | null;
    unit_price: number | null;
    qty: number;
    total: number | null;
    lead_days: number | null;
    in_range: boolean | null;
    range: string | null;
    others: string[];
  }[];
  total?: string;
};

const hasGateData = (g?: GateData) => Boolean(g && (g.figures?.length || g.materials?.length || g.rfqs?.length || g.evidence?.length));

const sar = (n: number | null) => (n === null ? "—" : `SAR ${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/** What the stage calculated: plain figures, material cover, and supplier quotes. */
function GateFigures({ data }: { data?: GateData }) {
  if (!hasGateData(data)) return null;
  const g = data!;
  return (
    <div className="mt-4 space-y-5">
      {g.figures && g.figures.length > 0 && (
        <dl className="divide-y border-t text-[15px]">
          {g.figures.map((x) => (
            <div key={x.label} className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-muted-foreground">{x.label}</dt>
              <dd className="text-right">{x.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {g.materials && g.materials.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-sm text-muted-foreground">
            Materials · {g.materials.filter((m) => m.short > 0).length} short of {g.materials.length}
          </h4>
          <ul className="space-y-2.5">
            {g.materials.map((m) => {
              const cover = m.need > 0 ? Math.min(1, m.available / m.need) : 1;
              return (
                <li key={m.name} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[15px]">{m.name}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-1.5 py-0.5 text-[12.5px] font-medium",
                        m.short > 0 ? "bg-blocked-soft text-blocked" : "bg-ready-soft text-ready",
                      )}
                    >
                      {m.short > 0 ? `short ${m.short} ${m.unit}` : "covered"}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div className={cn("h-full rounded-full", m.short > 0 ? "bg-blocked" : "bg-ready")} style={{ width: `${cover * 100}%` }} />
                  </div>
                  <p className="tabular text-xs text-muted-foreground">
                    {m.available} of {m.need} {m.unit} in stock
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {g.rfqs && g.rfqs.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-sm text-muted-foreground">Supplier quotes</h4>
          <ul className="space-y-2">
            {g.rfqs.map((q) => (
              <li key={q.item} className="rounded-2xl border p-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[15px] font-medium">{q.item}</span>
                  {q.in_range === false ? (
                    <span className="rounded-md bg-blocked-soft px-1.5 py-0.5 text-[12.5px] font-medium text-blocked">above the agreed range {q.range}</span>
                  ) : q.in_range ? (
                    <span className="rounded-md bg-ready-soft px-1.5 py-0.5 text-[12.5px] font-medium text-ready">in range {q.range}</span>
                  ) : (
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[12.5px] font-medium text-muted-foreground">no quote on file</span>
                  )}
                </div>
                {q.supplier ? (
                  <>
                    <p className="pt-1 text-sm text-muted-foreground">
                      {q.supplier} · {q.qty} {q.unit} at {sar(q.unit_price)}/{q.unit}
                      {q.lead_days ? ` · ${q.lead_days} working days` : ""}
                    </p>
                    <p className="pt-1 text-[15px]">
                      {sar(q.total)} <span className="text-sm text-muted-foreground">for a {q.short} {q.unit} shortfall</span>
                    </p>
                    {q.others.length > 0 && <p className="pt-1 text-xs text-muted-foreground">Also quoted: {q.others.join("; ")}</p>}
                  </>
                ) : (
                  <p className="pt-1 text-sm text-muted-foreground">
                    {q.short} {q.unit} short · still needs an RFQ
                  </p>
                )}
              </li>
            ))}
          </ul>
          {g.total && (
            <p className="flex items-baseline justify-between gap-4 border-t pt-2.5 text-[15px]">
              <span className="text-muted-foreground">Total to purchase</span>
              <span className="font-medium">{g.total}</span>
            </p>
          )}
        </section>
      )}

      {g.evidence && g.evidence.length > 0 && <Evidence items={g.evidence} />}
      {g.technical && g.technical.length > 0 && <TechnicalDetails rows={g.technical} />}
    </div>
  );
}

function OpenPill({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-0.5 text-[12px] font-medium text-brand-strong">
      <span className="h-1.5 w-1.5 rounded-full bg-brand-strong" aria-hidden />
      {label}
    </span>
  );
}

function RequestBody({ data: d, onClose, embedded }: { data: RequestView; onClose?: () => void; embedded: boolean }) {
  const r = d.request;
  const router = useRouter();
  const pathname = usePathname();
  const { eyebrow, title } = headline(d);
  const isAction = r.type === "authorization" && !d.is_task_proposal && !r.gate_key;
  const [message, setMessage] = useState<string | null>(() => lastMessages.get(r.id) ?? null);
  const onRecorded = (m: string) => {
    lastMessages.set(r.id, m);
    drafts.delete(r.id);
    setMessage(m);
    // The work carries on in the task the request belongs to, so go there.
    const taskId = d.task?.id;
    if (taskId && pathname !== `/tasks/${taskId}`) router.push(`/tasks/${taskId}`);
  };
  const canRespond = (d.is_recipient || d.can_respond) && r.status === "Open";
  const standingIn = !d.is_recipient && d.can_respond;

  return (
    <article className="flex min-h-full flex-col" aria-labelledby={`req-${r.id}-title`}>
      <header className="space-y-1.5 border-b pb-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{eyebrow}</p>
          {onClose && <Button variant="minimal" size="small" icon="cross" aria-label="Close request" onClick={onClose} className="-mr-2 !text-muted-foreground" />}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h2 id={`req-${r.id}-title`} className="font-display text-2xl leading-tight text-balance">
            {title}
          </h2>
          {r.status === "Open" ? (
            <OpenPill label={isAction || d.is_task_proposal || r.type === "review" ? "Awaiting review" : "Awaiting answer"} />
          ) : (
            <StatusTag kind="request" value={r.status} />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {d.requester}
          {d.requester_kind === "agent" && " (agent)"} · <Time iso={r.created_at} />
          {!d.recipient_active && <span className="text-risk"> · {d.recipient} no longer has access</span>}
        </p>
      </header>

      <div className="flex-1 space-y-6 py-5">
        {message && (
          <Callout intent="success" icon="tick-circle" role="status" aria-live="polite">
            {message}
          </Callout>
        )}

        {(r.status === "Withdrawn" || r.status === "Superseded") && (
          <Callout icon="disable" title={r.status === "Withdrawn" ? "This request was withdrawn" : "This request was replaced"}>
            {r.status === "Withdrawn"
              ? "It no longer needs a decision. Nothing can be recorded against it."
              : "A newer request replaced this one, so it no longer needs a decision. Nothing can be recorded against it."}
            {r.superseded_by && (
              <div className="mt-2">
                <RecordLink href={`/requests/${r.superseded_by}`}>Open the newer request</RecordLink>
              </div>
            )}
          </Callout>
        )}

        {r.gate_key ? (
          <Section label="What this decision moves">
            <p className="text-[15px] leading-relaxed text-foreground">{r.reason}</p>
            <GateFigures data={r.gate_data as GateData} />
            {!hasGateData(r.gate_data as GateData) && r.context_excerpt && (
              <dl className="mt-3 divide-y border-t text-[15px]">
                {r.context_excerpt.split("\n").map((line) => {
                  const at = line.indexOf(": ");
                  const [label, value] = at > 0 && at < 40 ? [line.slice(0, at), line.slice(at + 2)] : [null, line];
                  return label ? (
                    <div key={line} className="flex items-baseline justify-between gap-4 py-2.5">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="text-right">{value}</dd>
                    </div>
                  ) : (
                    <p key={line} className="py-2.5">
                      {value}
                    </p>
                  );
                })}
              </dl>
            )}
          </Section>
        ) : isAction ? (
          <Section label="Proposed change">
            <p className="text-[15px] leading-relaxed text-foreground">{r.question}</p>
            {r.reason && (
              <div className="space-y-1 pt-3">
                <p className="text-sm text-muted-foreground">Why this action</p>
                <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{r.reason}</p>
              </div>
            )}
          </Section>
        ) : (
          <>
            {r.type !== "information" && !d.is_task_proposal && (
              <Section label="What is needed">
                <p className="text-[15px] leading-relaxed">{r.question}</p>
              </Section>
            )}
            {r.reason && (
              <Section label="Why">
                <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{r.reason}</p>
              </Section>
            )}
          </>
        )}

        {r.status === "Open" && d.task && !d.is_task_proposal && (
          <p className="text-xs text-muted-foreground">
            Blocking <span className="font-medium text-foreground">{d.task.title}</span> until answered.
          </p>
        )}

        {r.context_excerpt && !r.gate_key && (
          <Section label={d.is_task_proposal ? "What you asked" : isAction ? "Evidence excerpt" : "Context"}>
            <blockquote className="whitespace-pre-wrap rounded-lg bg-muted/70 px-3 py-2.5 text-sm leading-relaxed text-foreground/90">{r.context_excerpt}</blockquote>
          </Section>
        )}

        <SubjectLinks d={d} />

        {r.type === "review" && <ReviewDetails d={d} />}
        {isAction && <ActionDetails d={d} />}

        {r.status === "Resolved" && <Recorded d={d} />}

        {canRespond && r.gate_key && (
          <div className="brand-intent border-t pt-5">
            <AuthorizationControls d={d} onRecorded={onRecorded} />
          </div>
        )}

        {canRespond && !isAction && !r.gate_key && (
          <div className="brand-intent space-y-3 border-t pt-5">
            <h3 className="text-[15px] font-medium">{standingIn ? `Response on behalf of ${d.recipient}` : "Your response"}</h3>
            {standingIn && (
              <EffectNote>
                This request is addressed to {d.recipient}. You&apos;re answering from the demo account, and the response is recorded under your name.
              </EffectNote>
            )}
            {r.type === "information" && <InformationControls d={d} onRecorded={onRecorded} />}
            {r.type === "review" && <ReviewControls d={d} onRecorded={onRecorded} />}
            {d.is_task_proposal && <TaskApprovalControls d={d} onRecorded={onRecorded} />}
          </div>
        )}

        {!d.is_recipient && !d.can_respond && r.status === "Open" && (
          <EffectNote>Waiting for {d.recipient} to respond. Only the recipient can record a response.</EffectNote>
        )}
      </div>

      {canRespond && isAction && (
        <footer className={cn("-mx-6 -mb-6 border-t bg-card px-6 pb-5 pt-4", !embedded && "sticky bottom-0")}>
          <AuthorizationControls d={d} onRecorded={onRecorded} />
        </footer>
      )}
    </article>
  );
}

function SubjectLinks({ d }: { d: RequestView }) {
  const items: { label: string; value: React.ReactNode }[] = [];
  if (d.task) {
    items.push({
      label: "Task",
      value: (
        <span className="inline-flex flex-wrap items-center gap-2">
          <RecordLink href={`/tasks/${d.task.id}`}>{d.task.title}</RecordLink>
          <StatusTag kind="task" value={d.task.status} />
        </span>
      ),
    });
  }
  if (d.output_hidden) {
    items.push({ label: "Document", value: <span className="text-muted-foreground">You can&apos;t open the document this request refers to.</span> });
  } else if (d.output && d.request.type !== "review") {
    items.push({
      label: "Document",
      value: <RecordLink href={`/outputs/${d.output.id}?version=${d.output.version}`}>{`${d.output.title} · Version ${d.output.version}`}</RecordLink>,
    });
  }
  if (d.is_task_proposal && d.assignment?.conversation_id) {
    items.push({ label: "Conversation", value: <RecordLink href={`/conversations/${d.assignment.conversation_id}`}>Open the conversation</RecordLink> });
  } else if (d.assignment) {
    items.push({
      label: "Agent assignment",
      value: (
        <span className="inline-flex flex-wrap items-center gap-2">
          <RecordLink href={`/assignments/${d.assignment.id}`}>{d.assignment.purpose}</RecordLink>
          <StatusTag kind="assignment" value={d.assignment.status} />
        </span>
      ),
    });
  }
  if (!items.length) return null;
  return (
    <Section label="Subject">
      <KeyValue items={items} />
    </Section>
  );
}

function ReviewDetails({ d }: { d: RequestView }) {
  const o = d.output;
  const rv = d.review;
  return (
    <div className="space-y-4">
      {o && (
        <Section label={`Version ${o.version} under review`}>
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
            <RecordLink href={`/outputs/${o.id}?version=${o.version}`}>{`${o.title} · Version ${o.version}`}</RecordLink>
          </div>
          {o.current_version > o.version && (
            <div className="pb-2">
              <EffectNote tone="warn">
                Newer edits exist (version {o.current_version}) — this review concerns version {o.version}.
              </EffectNote>
            </div>
          )}
          <div className="max-h-96 overflow-auto rounded-lg border bg-background p-4" tabIndex={0} aria-label={`Version ${o.version} content`}>
            {o.content ? <Markdown>{o.content}</Markdown> : <p className="text-sm text-muted-foreground">This version has no content.</p>}
          </div>
        </Section>
      )}
      {rv && (
        <Section label="Review">
          <KeyValue
            items={[
              { label: "Status", value: <StatusTag kind="review" value={rv.status} /> },
              { label: "Version", value: `Version ${rv.version}` },
              { label: "Requested by", value: rv.requested_by },
              ...(rv.note ? [{ label: "Note", value: <span className="whitespace-pre-wrap">{rv.note}</span> }] : []),
              {
                label: "Reviewers",
                value: (
                  <ul className="space-y-1">
                    {rv.reviewers.map((x) => (
                      <li key={x.name} className="flex flex-wrap items-center gap-2">
                        <Avatar name={x.name} size={18} />
                        <span>{x.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {x.decision ? responseWords(x.decision) : x.request_status === "Open" ? "Not yet decided" : (x.request_status ?? "Not yet decided")}
                        </span>
                        {x.text && <span className="w-full pl-6 text-xs text-foreground/80">“{x.text}”</span>}
                      </li>
                    ))}
                  </ul>
                ),
              },
            ]}
          />
        </Section>
      )}
    </div>
  );
}

/** "14 Sep · 09:12Z" — the moment a check was read, in UTC. */
function asOf(iso: string) {
  const t = new Date(iso);
  const day = t.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const time = t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
  return `${day} · ${time}Z`;
}

function CheckRow({ label, expected, observed, at }: { label: string; expected: string; observed: string | null; at: string | null }) {
  const matched = observed !== null && observed === expected;
  return (
    <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 border-b py-3 last:border-b-0">
      <div className="min-w-0 space-y-1">
        <p className="text-[15px] leading-tight">{label}</p>
        <span
          className={cn(
            "inline-block rounded-md px-1.5 py-0.5 text-[11.5px] font-medium leading-4",
            observed === null ? "bg-muted text-muted-foreground" : matched ? "bg-ready-soft text-ready" : "bg-blocked-soft text-blocked",
          )}
        >
          {observed === null ? "Not readable" : matched ? "Matched when drafted" : "Changed since drafted"}
        </span>
        {at && <p className="text-xs text-muted-foreground">as of {asOf(at)}</p>}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">expected</p>
        <p className="break-words text-[15px]">{expected}</p>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">observed</p>
        <p className="break-words text-[15px]">{observed ?? "—"}</p>
      </div>
    </div>
  );
}

function ActionDetails({ d }: { d: RequestView }) {
  const a = d.action;
  const check = useOp("checkActionResult", { success: (res) => res.message });
  if (!a) {
    return <EffectNote>The proposed action for this request isn&apos;t available to you.</EffectNote>;
  }
  const decided = Boolean(a.decided_at) || a.status !== "AwaitingAuthorization";
  const approvedPending = a.status === "AwaitingAuthorization" && Boolean(a.decided_at);
  const record = a.record;
  const drafted = (a.drafted ?? {}) as Record<string, unknown>;
  const draftedVersion = drafted.record_version;
  const facts = Object.entries(drafted).filter(([k, v]) => k !== "record_version" && v !== null && v !== undefined && v !== "");
  const observedField = record ? (record.data as Record<string, unknown>)[a.field] : undefined;

  return (
    <div className="space-y-6">
      <section aria-label="Change to the record" className="border-t pt-5">
        <h3 className="pb-2 text-[15px] font-medium">{a.target_label}</h3>
        <dl className="divide-y text-[15px]">
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt>{humanize(a.field)}</dt>
            <dd className="text-right">
              {a.current_value && <span className="text-muted-foreground line-through">{a.current_value}</span>}
              <span className="text-muted-foreground"> → </span>
              <span className="font-medium">{a.proposed_value}</span>
            </dd>
          </div>
          {a.reason && a.reason !== d.request.reason && (
            <div className="flex items-baseline justify-between gap-4 py-2.5">
              <dt>Reason</dt>
              <dd className="text-right">{a.reason}</dd>
            </div>
          )}
          {facts.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 py-2.5">
              <dt>{humanize(k)}</dt>
              <dd className="text-right tabular">{String(v)}</dd>
            </div>
          ))}
        </dl>
      </section>

      {!decided && (
        <section className="space-y-1 border-t pt-5">
          <h3 className="text-[15px] font-medium">Checks before execution</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Rechecked right before the change is written. If the record has changed since review, the write fails.
          </p>
          <div className="pt-1">
            <CheckRow
              label={humanize(a.field)}
              expected={a.current_value ?? "—"}
              observed={record ? (observedField === undefined || observedField === null ? null : String(observedField)) : null}
              at={record?.updated_at ?? null}
            />
            {draftedVersion !== undefined && (
              <CheckRow label="Record version" expected={String(draftedVersion)} observed={record ? String(record.version) : null} at={record?.updated_at ?? null} />
            )}
          </div>
        </section>
      )}

      {decided && (
        <Section label="Action status" className="border-t pt-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {approvedPending ? (
                <>
                  <StatusTag kind="action" value="Approved" />
                  <span className="text-sm">Approved — action not yet confirmed</span>
                </>
              ) : (
                <StatusTag kind="action" value={a.status} />
              )}
              {a.decided_by_name && (
                <span className="text-xs text-muted-foreground">
                  Decided by {a.decided_by_name} <Time iso={a.decided_at} />
                </span>
              )}
            </div>
            {a.status === "Uncertain" && (
              <div className="space-y-2">
                <EffectNote tone="warn">The outcome isn&apos;t known yet. Checking reads the current record; it never repeats the change.</EffectNote>
                <Button size="small" variant="outlined" icon="search" loading={check.isPending} onClick={() => check.mutate({ attempt_id: a.id })}>
                  Check current record
                </Button>
              </div>
            )}
            {a.evidence.length > 0 ? (
              <ol className="space-y-2 border-l pl-3">
                {a.evidence.map((e) => (
                  <li key={e.id} className="text-sm">
                    <p className="leading-snug">{e.establishes}</p>
                    <Time iso={e.created_at} className="text-xs text-muted-foreground" />
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-muted-foreground">No result evidence yet.</p>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

function Recorded({ d }: { d: RequestView }) {
  const r = d.request;
  const items: { label: string; value: React.ReactNode }[] = [
    { label: "Response", value: responseWords(r.response_kind) },
  ];
  if (r.response_text) items.push({ label: "Text", value: <span className="whitespace-pre-wrap">{r.response_text}</span> });
  if (d.suggested) items.push({ label: "Suggested person", value: `${d.suggested} (nothing was sent to them)` });
  if (d.evidence_source) items.push({ label: "Evidence", value: <RecordLink href={`/sources/${d.evidence_source.id}`}>{d.evidence_source.title}</RecordLink> });
  if (d.responded_by) items.push({ label: "Responded by", value: d.responded_by });
  if (r.responded_at) items.push({ label: "When", value: <Time iso={r.responded_at} /> });
  return (
    <Section label="What was recorded">
      <div className="rounded-lg border bg-background p-4">
        <KeyValue items={items} />
      </div>
    </Section>
  );
}

type ControlsProps = { d: RequestView; onRecorded: (message: string) => void };

function ErrorLine({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <Callout intent="danger" compact role="alert">
      {error.message}
    </Callout>
  );
}

function InformationControls({ d, onRecorded }: ControlsProps) {
  const id = d.request.id;
  const shell = useShell();
  const respond = useOp("respond", { silent: true });
  const [text, setText] = useDraft(id, "answer");
  const [evTitle, setEvTitle] = useDraft(id, "evTitle");
  const [evContent, setEvContent] = useDraft(id, "evContent");
  const [showEvidence, setShowEvidence] = useState(() => Boolean(drafts.get(id)?.evContent));
  const [suggesting, setSuggesting] = useState(false);
  const [suggested, setSuggested] = useDraft(id, "suggested");

  const send = async (response: Parameters<typeof respond.mutateAsync>[0]["response"]) => {
    try {
      const res = await respond.mutateAsync({ request_id: id, response });
      onRecorded(res.message);
    } catch {
      /* shown inline */
    }
  };

  return (
    <div className="space-y-3">
      <FormGroup label="Your answer" labelFor={`answer-${id}`} className="!mb-0">
        <TextArea id={`answer-${id}`} fill autoResize value={text} onChange={(e) => setText(e.currentTarget.value)} rows={4} placeholder="What you know, and how you know it" />
      </FormGroup>

      <div>
        <Button
          variant="minimal"
          size="small"
          icon={showEvidence ? "chevron-down" : "chevron-right"}
          aria-expanded={showEvidence}
          aria-controls={`evidence-${id}`}
          onClick={() => setShowEvidence((v) => !v)}
        >
          Attach evidence (optional)
        </Button>
        <Collapse isOpen={showEvidence}>
          <div id={`evidence-${id}`} className="space-y-2 pt-2">
            <FormGroup label="Evidence title" labelFor={`ev-title-${id}`} className="!mb-0">
              <InputGroup id={`ev-title-${id}`} value={evTitle} onChange={(e) => setEvTitle(e.currentTarget.value)} placeholder="e.g. Support terms, section 4" />
            </FormGroup>
            <FormGroup label="Evidence content" labelFor={`ev-content-${id}`} className="!mb-0">
              <TextArea id={`ev-content-${id}`} fill rows={4} value={evContent} onChange={(e) => setEvContent(e.currentTarget.value)} placeholder="Paste the relevant passage" />
            </FormGroup>
            <EffectNote>Evidence is saved as a restricted source that the requester can open.</EffectNote>
          </div>
        </Collapse>
      </div>

      <ErrorLine error={respond.error} />

      <div className="flex flex-wrap gap-2">
        <Button
          intent="primary"
          text="Submit answer"
          disabled={!text.trim() || respond.isPending}
          loading={respond.isPending && respond.variables?.response.kind === "answer"}
          onClick={() =>
            send({ kind: "answer", text, evidence: evContent.trim() ? { title: evTitle, content: evContent } : null })
          }
        />
        <Button
          variant="outlined"
          text="I don't know"
          disabled={respond.isPending}
          loading={respond.isPending && respond.variables?.response.kind === "dont_know"}
          onClick={() => send({ kind: "dont_know" })}
        />
        <Button variant="outlined" text="Suggest another person" disabled={respond.isPending} active={suggesting} aria-expanded={suggesting} onClick={() => setSuggesting((v) => !v)} />
      </div>

      <Collapse isOpen={suggesting}>
        <div className="space-y-2 rounded-md border p-3">
          <FormGroup label="Who might know?" labelFor={`suggest-${id}`} className="!mb-0">
            <PersonSelect id={`suggest-${id}`} people={shell?.members ?? []} value={suggested} onChange={setSuggested} exclude={shell ? [shell.me.user_id] : []} />
          </FormGroup>
          <EffectNote>This records your suggestion. Nothing is sent to them or shared.</EffectNote>
          <Button
            size="small"
            intent="primary"
            text="Record suggestion"
            disabled={!suggested || respond.isPending}
            loading={respond.isPending && respond.variables?.response.kind === "suggest"}
            onClick={() => send({ kind: "suggest", suggested_user_id: suggested })}
          />
        </div>
      </Collapse>
    </div>
  );
}

function ReviewControls({ d, onRecorded }: ControlsProps) {
  const id = d.request.id;
  const respond = useOp("respond", { silent: true });
  const [changing, setChanging] = useState(() => Boolean(drafts.get(id)?.changes));
  const [text, setText] = useDraft(id, "changes");
  const version = d.output?.version ?? d.review?.version ?? d.request.output_version;

  const send = async (response: Parameters<typeof respond.mutateAsync>[0]["response"]) => {
    try {
      const res = await respond.mutateAsync({ request_id: id, response });
      onRecorded(res.message);
    } catch {
      /* shown inline */
    }
  };

  return (
    <div className="space-y-3">
      <EffectNote>Optional comments belong on the document. Accepting a version doesn&apos;t authorize any external action.</EffectNote>
      <ErrorLine error={respond.error} />
      <div className="flex flex-wrap gap-2">
        <Button
          intent="primary"
          icon="tick"
          text={version ? `Accept version ${version}` : "Accept version"}
          disabled={respond.isPending}
          loading={respond.isPending && respond.variables?.response.kind === "accept"}
          onClick={() => send({ kind: "accept" })}
        />
        <Button variant="outlined" text="Request changes" active={changing} aria-expanded={changing} disabled={respond.isPending} onClick={() => setChanging((v) => !v)} />
      </div>
      <Collapse isOpen={changing}>
        <div className="space-y-2 rounded-md border p-3">
          <FormGroup label="What needs to change?" labelFor={`changes-${id}`} helperText="Required. The author sees this explanation." className="!mb-0">
            <TextArea id={`changes-${id}`} fill rows={3} value={text} onChange={(e) => setText(e.currentTarget.value)} />
          </FormGroup>
          <Button
            size="small"
            intent="danger"
            text={version ? `Request changes to version ${version}` : "Request changes"}
            disabled={!text.trim() || respond.isPending}
            loading={respond.isPending && respond.variables?.response.kind === "request_changes"}
            onClick={() => send({ kind: "request_changes", text })}
          />
        </div>
      </Collapse>
    </div>
  );
}

function TaskApprovalControls({ d, onRecorded }: ControlsProps) {
  const respond = useOp("respond", { silent: true });
  const send = async (kind: "approve" | "decline") => {
    try {
      const res = await respond.mutateAsync({ request_id: d.request.id, response: { kind } });
      onRecorded(res.message);
    } catch {
      /* shown inline */
    }
  };
  return (
    <div className="space-y-3">
      <EffectNote>Approving starts {d.requester} on this task. You stay responsible for it. Declining cancels the task.</EffectNote>
      <ErrorLine error={respond.error} />
      <div className="flex flex-wrap gap-2">
        <Button
          intent="primary"
          icon="tick"
          text="Approve and start"
          disabled={respond.isPending}
          loading={respond.isPending && respond.variables?.response.kind === "approve"}
          onClick={() => send("approve")}
        />
        <Button
          variant="outlined"
          text="Decline"
          disabled={respond.isPending}
          loading={respond.isPending && respond.variables?.response.kind === "decline"}
          onClick={() => send("decline")}
        />
      </div>
    </div>
  );
}

function AuthorizationControls({ d, onRecorded }: ControlsProps) {
  const id = d.request.id;
  const respond = useOp("respond", { silent: true });
  const decided = Boolean(d.action?.decided_at);
  const [signing, setSigning] = useState(false);
  const shell = useShell();

  const send = async (response: Parameters<typeof respond.mutateAsync>[0]["response"]) => {
    try {
      const res = await respond.mutateAsync({ request_id: id, response });
      setSigning(false);
      onRecorded(res.message);
    } catch {
      /* shown inline */
    }
  };

  const a = d.action;
  const gate = Boolean(d.request.gate_key);
  return (
    <div className="space-y-2">
      <ErrorLine error={respond.error} />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setSigning(true)}
          disabled={respond.isPending || (!gate && (decided || !a))}
          className="h-11 rounded-full bg-foreground text-[15px] font-medium text-white transition-colors hover:bg-foreground/85 disabled:opacity-40"
        >
          {gate ? "Approve and move on…" : "Approve…"}
        </button>
        <button
          type="button"
          onClick={() => void send({ kind: "decline" })}
          disabled={respond.isPending || decided}
          className="h-11 rounded-full border bg-card text-[15px] font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-40"
        >
          {respond.isPending && respond.variables?.response.kind === "decline" ? "Sending back…" : "Send back"}
        </button>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        {gate ? "Approving records this stage and opens the next decision" : "Approving opens a simulated signing step"}
      </p>

      <Dialog isOpen={signing} onClose={() => !respond.isPending && setSigning(false)} title={gate ? "Approve this stage" : "Sign approval"} className="!w-[min(440px,calc(100vw-2rem))] !pb-0">
        <div className="space-y-4 p-5">
          {a && (
            <div className="space-y-1 rounded-xl bg-muted/70 px-4 py-3 text-sm">
              <p className="text-muted-foreground">{a.target_label}</p>
              <p>
                {humanize(a.field)}: <span className="text-muted-foreground line-through">{a.current_value ?? "—"}</span> →{" "}
                <span className="font-medium">{a.proposed_value}</span>
              </p>
            </div>
          )}
          {gate && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Approving as <span className="text-foreground">{shell?.me.full_name ?? "you"}</span> records this stage of the case and opens the next decision for
              whoever owns it. Nothing is sent to a customer or a supplier by this approval.
            </p>
          )}
          {!gate && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Signing as <span className="text-foreground">{shell?.me.full_name ?? "you"}</span> approves this exact change. Loura rechecks your authority and the record right before
            writing it, then shows the actual result. This signing step is simulated — no signature is collected.
          </p>
          )}
          <ErrorLine error={respond.error} />
          <div className="flex justify-end gap-2">
            <Button variant="outlined" text="Cancel" disabled={respond.isPending} onClick={() => setSigning(false)} />
            <Button intent="primary" icon="endorsed" text={gate ? "Approve stage" : "Sign and approve"} loading={respond.isPending} onClick={() => void send({ kind: "approve" })} />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
