"use client";

import { useState } from "react";
import { Button, Collapse, FormGroup, HTMLSelect, Icon, Switch } from "@blueprintjs/core";
import { useOp, type ViewData } from "@/lib/api";
import { EffectNote } from "@/components/ui/layout";
import { ActivityList, PersonSelect, Time } from "@/components/ui/content";
import { useShell } from "@/components/shell/shell-context";
import { ConfirmButton, InlineError, opLabel } from "@/components/ui/common";
import { cn } from "@/lib/utils";

type Admin = ViewData<"admin">;
type Member = Admin["members"][number];
type Rule = Admin["rules"][number];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-3xl border bg-card shadow-[0_1px_3px_rgb(28_26_24/0.04)]", className)}>{children}</section>;
}

// ---------------------------------------------------------------------------
// Organization and people
// ---------------------------------------------------------------------------

export function PeopleTab({ d }: { d: Admin }) {
  return (
    <div className="space-y-5">
      <ul className="space-y-2.5">
        {d.members.map((m) => (
          <MemberCard key={m.user_id} m={m} />
        ))}
      </ul>
      <ResetCard />
    </div>
  );
}

function MemberCard({ m }: { m: Member }) {
  const shell = useShell();
  const isMe = shell?.me.user_id === m.user_id;
  const [open, setOpen] = useState(false);
  const [effective, setEffective] = useState<string | null>(null);
  const caps = useOp("setMemberCapabilities", { success: `${m.full_name}'s permissions changed — effective now` });
  const membership = useOp("setMembership", {
    success: (r) =>
      r.paused != null && r.paused > 0
        ? `${m.full_name} removed. ${r.paused} assignment(s) they were responsible for are pausing.`
        : `${m.full_name}'s organization access changed — effective now`,
  });

  const flags = { is_admin: m.is_admin, is_creator: m.is_creator, is_supervisor: m.is_supervisor };
  const toggle = (key: keyof typeof flags, value: boolean) => {
    setEffective(null);
    caps.mutate({ user_id: m.user_id, ...flags, [key]: value }, { onSuccess: () => setEffective("Effective now") });
  };
  const removed = m.status === "removed";
  const roles = [m.is_admin && "Administrator", m.is_creator && "Creator", m.is_supervisor && "Supervisor"].filter(Boolean) as string[];

  return (
    <li>
      <Card className={cn(removed && "opacity-70")}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center gap-4 px-5 py-4 text-left"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-[13px] font-medium" aria-hidden>
            {initials(m.full_name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium">
              {m.full_name}
              {isMe && <span className="font-normal text-muted-foreground"> (you)</span>}
            </span>
            <span className="block truncate text-sm text-muted-foreground">{m.title}</span>
          </span>
          {removed && <span className="shrink-0 rounded-md bg-blocked-soft px-2 py-0.5 text-[13px] font-medium text-blocked">Removed</span>}
          {!removed && roles.length > 0 && <span className="hidden shrink-0 text-sm text-muted-foreground sm:block">{roles.join(" · ")}</span>}
          <Icon icon={open ? "chevron-up" : "chevron-down"} size={14} className="shrink-0 text-muted-foreground" aria-hidden />
        </button>

        <Collapse isOpen={open}>
          <div className="space-y-4 border-t px-5 py-4">
            <p className="text-sm text-muted-foreground">{m.email}</p>
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
              <Permission
                label="Administrator"
                hint="Manages people, rules, and fixtures"
                checked={m.is_admin}
                disabled={caps.isPending || (isMe && m.is_admin)}
                note={isMe && m.is_admin ? "You can't remove your own" : undefined}
                onChange={(v) => toggle("is_admin", v)}
                name={m.full_name}
              />
              <Permission
                label="Creator"
                hint="Defines agents and procedures in Studio"
                checked={m.is_creator}
                disabled={caps.isPending}
                onChange={(v) => toggle("is_creator", v)}
                name={m.full_name}
              />
              <Permission
                label="Supervisor"
                hint="Sees every assignment in the Control Room"
                checked={m.is_supervisor}
                disabled={caps.isPending}
                onChange={(v) => toggle("is_supervisor", v)}
                name={m.full_name}
              />
            </div>
            <p aria-live="polite" className="text-xs text-ready">
              {effective}
            </p>
            <InlineError error={caps.error} />

            {!isMe && (
              <div className="border-t pt-3">
                {removed ? (
                  <ConfirmButton
                    text="Restore access"
                    icon="undo"
                    title={`Restore ${m.full_name}`}
                    body={<EffectNote>Restores organization access. Earlier shares apply again; paused assignments stay paused until someone resumes them.</EffectNote>}
                    onConfirm={() => membership.mutateAsync({ user_id: m.user_id, active: true })}
                    loading={membership.isPending}
                    error={membership.error}
                  />
                ) : (
                  <ConfirmButton
                    text="Remove from organization"
                    icon="remove"
                    intent="danger"
                    title={`Remove ${m.full_name} from the organization`}
                    body={
                      <EffectNote tone="warn">
                        Blocks all access, including earlier shares. Pending requests stay unresolved; assignments they&apos;re responsible for pause. Nothing is
                        reassigned.
                      </EffectNote>
                    }
                    confirmText="Remove"
                    onConfirm={() => membership.mutateAsync({ user_id: m.user_id, active: false })}
                    loading={membership.isPending}
                    error={membership.error}
                  />
                )}
              </div>
            )}
          </div>
        </Collapse>
      </Card>
    </li>
  );
}

function Permission({
  label,
  hint,
  checked,
  disabled,
  note,
  onChange,
  name,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  note?: string;
  onChange: (v: boolean) => void;
  name: string;
}) {
  return (
    <div>
      <Switch className="!mb-0" aria-label={`${label} — ${name}`} checked={checked} disabled={disabled} label={label} onChange={(e) => onChange(e.currentTarget.checked)} />
      <p className="pl-[38px] text-xs text-muted-foreground">{note ?? hint}</p>
    </div>
  );
}

function ResetCard() {
  const reset = useOp("resetFixtures", { success: "Prototype fixtures restored to their starting state" });
  return (
    <Card className="!border-blocked/40">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-blocked">Reset prototype fixtures</p>
          <p className="text-sm text-muted-foreground">Deletes all activity and restores the starting fixtures for everyone using this prototype.</p>
        </div>
        <ConfirmButton
          text="Reset prototype fixtures"
          icon="reset"
          intent="danger"
          title="Reset prototype fixtures"
          body={
            <EffectNote tone="warn">
              This deletes all activity, documents, tasks, cases, assignments, requests, and runs, and restores the starting fixtures for everyone. It can&apos;t
              be undone. Anyone working in the prototype right now loses their work.
            </EffectNote>
          }
          confirmText="Delete everything and reset"
          onConfirm={() => reset.mutateAsync({})}
          loading={reset.isPending}
          error={reset.error}
        />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Roles and access: which external operations an agent may carry out, and who approves
// ---------------------------------------------------------------------------

const RULE_OPTIONS = [
  { value: "allowed", label: "Allowed without approval" },
  { value: "approval", label: "Needs approval" },
  { value: "denied", label: "Not permitted" },
];

const RULE_TONE: Record<string, string> = {
  allowed: "bg-ready-soft text-ready",
  approval: "bg-brand/10 text-brand-strong",
  denied: "bg-blocked-soft text-blocked",
};

export function RolesTab({ d }: { d: Admin }) {
  return (
    <div className="space-y-4">
      <p className="text-[15px] text-muted-foreground">
        What agents may carry out in external systems, and who approves it. Product administration doesn&apos;t itself grant business decision authority, and
        decisions already made are rechecked before anything is dispatched.
      </p>
      {d.rules.length ? (
        <ul className="space-y-2.5">
          {d.rules.map((r) => (
            <RuleCard key={r.id} r={r} />
          ))}
        </ul>
      ) : (
        <Card>
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">No action rules are defined.</p>
        </Card>
      )}
    </div>
  );
}

function RuleCard({ r }: { r: Rule }) {
  const shell = useShell();
  const [open, setOpen] = useState(false);
  const [rule, setRule] = useState<Rule["rule"]>(r.rule);
  const [approver, setApprover] = useState(r.approver_id ?? "");
  const [effective, setEffective] = useState(false);
  const save = useOp("setActionRule", { success: `Rule for ${opLabel(r.operation).toLowerCase()} changed — effective now` });
  const changed = rule !== r.rule || (rule === "approval" && approver !== (r.approver_id ?? ""));

  return (
    <li>
      <Card>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-4 px-5 py-4 text-left">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium">{opLabel(r.operation)}</span>
            <span className="block truncate text-sm text-muted-foreground">
              {r.rule === "approval" && r.approver ? `Approved by ${r.approver}` : RULE_OPTIONS.find((o) => o.value === r.rule)?.label}
              {" · changed by "}
              {r.updated_by_name} <Time iso={r.updated_at} />
            </span>
          </span>
          <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[13px] font-medium", RULE_TONE[r.rule] ?? "bg-muted text-muted-foreground")}>
            {RULE_OPTIONS.find((o) => o.value === r.rule)?.label}
          </span>
          <Icon icon={open ? "chevron-up" : "chevron-down"} size={14} className="shrink-0 text-muted-foreground" aria-hidden />
        </button>

        <Collapse isOpen={open}>
          <div className="space-y-3 border-t px-5 py-4">
            <p className="font-mono text-xs text-muted-foreground">{r.operation}</p>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <FormGroup label="Rule" labelFor={`rule-${r.id}`} className="!mb-0">
                <HTMLSelect
                  id={`rule-${r.id}`}
                  fill
                  value={rule}
                  onChange={(e) => {
                    setRule(e.currentTarget.value as Rule["rule"]);
                    setEffective(false);
                  }}
                  options={RULE_OPTIONS}
                />
              </FormGroup>
              {rule === "approval" ? (
                <FormGroup label="Approver" labelFor={`approver-${r.id}`} className="!mb-0">
                  <PersonSelect
                    id={`approver-${r.id}`}
                    people={shell?.members ?? []}
                    value={approver}
                    onChange={(v) => {
                      setApprover(v);
                      setEffective(false);
                    }}
                  />
                </FormGroup>
              ) : (
                <div />
              )}
              <Button
                intent="primary"
                text="Save rule"
                disabled={!changed || (rule === "approval" && !approver)}
                loading={save.isPending}
                onClick={() =>
                  save.mutate({ operation: r.operation, rule, approver_id: rule === "approval" ? approver : null }, { onSuccess: () => setEffective(true) })
                }
              />
            </div>
            <InlineError error={save.error} />
            <p aria-live="polite" className="text-xs text-ready">
              {effective ? "Effective for every check from now on." : ""}
            </p>
          </div>
        </Collapse>
      </Card>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Audit: every control decision, in order
// ---------------------------------------------------------------------------

export function AuditTab({ d }: { d: Admin }) {
  return (
    <Card>
      <div className="px-5 py-4">
        <ActivityList items={d.history} empty="No decisions recorded yet." />
      </div>
    </Card>
  );
}
