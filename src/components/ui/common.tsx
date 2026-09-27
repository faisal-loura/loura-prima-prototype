"use client";

import { useState } from "react";
import { Button, Checkbox, Dialog, DialogBody, DialogFooter, Icon, type Intent } from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";
import { cn } from "@/lib/utils";
import { Eyebrow } from "@/components/ui/layout";

/** Inline op error, kept near the control that failed. */
export function InlineError({ error }: { error: { message: string } | null | undefined }) {
  if (!error) return null;
  return (
    <p role="alert" className="flex gap-2 rounded-md bg-blocked-soft px-3 py-2 text-xs text-blocked">
      <Icon icon="error" size={12} className="mt-0.5 shrink-0" />
      <span>{error.message}</span>
    </p>
  );
}

/** Result message returned by an op, announced politely. */
export function ResultNote({ children, tone = "ok" }: { children: React.ReactNode; tone?: "ok" | "neutral" | "warn" }) {
  if (!children) return null;
  return (
    <p
      aria-live="polite"
      className={cn(
        "flex gap-2 rounded-md px-3 py-2 text-xs leading-relaxed",
        tone === "ok" ? "bg-ready-soft text-ready" : tone === "warn" ? "bg-risk-soft text-risk" : "bg-muted text-muted-foreground",
      )}
    >
      <Icon icon={tone === "ok" ? "tick-circle" : "info-sign"} size={12} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** A button that asks for confirmation, explaining what the action does and doesn't do. */
export function ConfirmButton({
  text,
  title,
  body,
  confirmText,
  onConfirm,
  intent = "primary",
  icon,
  variant = "outlined",
  size = "small",
  disabled,
  loading,
  error,
}: {
  text: string;
  title: string;
  body: React.ReactNode;
  confirmText?: string;
  onConfirm: () => Promise<unknown>;
  intent?: Intent;
  icon?: IconName;
  variant?: "solid" | "minimal" | "outlined";
  size?: "small" | "medium" | "large";
  disabled?: boolean;
  loading?: boolean;
  error?: { message: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function confirm() {
    setBusy(true);
    setFailed(false);
    try {
      await onConfirm();
      setOpen(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        text={text}
        icon={icon}
        variant={variant}
        size={size}
        intent={variant === "solid" ? intent : intent === "danger" ? "danger" : undefined}
        disabled={disabled}
        loading={loading}
        onClick={() => {
          setFailed(false);
          setOpen(true);
        }}
      />
      <Dialog isOpen={open} onClose={() => !busy && setOpen(false)} title={title} icon={icon}>
        <DialogBody className="space-y-3 text-sm">
          {body}
          {failed && <InlineError error={error ?? { message: "That didn't go through. Nothing was changed." }} />}
        </DialogBody>
        <DialogFooter
          actions={
            <>
              <Button variant="minimal" text="Cancel" onClick={() => setOpen(false)} disabled={busy} />
              <Button intent={intent} text={confirmText ?? text} loading={busy} onClick={confirm} />
            </>
          }
        />
      </Dialog>
    </>
  );
}

/** Keyboard-accessible checkbox list. */
export function CheckList({
  label,
  options,
  value,
  onChange,
  empty = "Nothing to choose from.",
}: {
  label?: string;
  options: { value: string; label: React.ReactNode; detail?: React.ReactNode }[];
  value: string[];
  onChange: (v: string[]) => void;
  empty?: string;
}) {
  return (
    <fieldset className="space-y-1">
      {label && <legend className="mb-1.5 text-sm">{label}</legend>}
      {!options.length && <p className="text-xs text-muted-foreground">{empty}</p>}
      {options.map((o) => (
        <Checkbox
          key={o.value}
          className="!mb-0 rounded-md px-2 py-1.5 hover:bg-muted"
          checked={value.includes(o.value)}
          onChange={(e) =>
            onChange(e.currentTarget.checked ? [...value, o.value] : value.filter((v) => v !== o.value))
          }
          labelElement={
            <span className="inline-flex flex-col">
              <span>{o.label}</span>
              {o.detail && <span className="text-xs text-muted-foreground">{o.detail}</span>}
            </span>
          }
        />
      ))}
    </fieldset>
  );
}

/** Compact table shell. Scrolls inside its card, never the page. */
export function DataTable({ head, children, className }: { head: React.ReactNode[]; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b">
            {head.map((h, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-eyebrow text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-2.5 align-top", className)}>{children}</td>;
}

export function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "warn" | "danger" }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <Eyebrow>{label}</Eyebrow>
      <p className={cn("mt-1 text-2xl font-light tabular", tone === "warn" && Number(value) > 0 && "text-risk", tone === "danger" && Number(value) > 0 && "text-blocked")}>
        {value}
      </p>
    </div>
  );
}

export const humanize = (s: string) => {
  const t = s.replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Key data from a record source: need, availability, or plain fields. */
export function sourceKeyData(data: Record<string, unknown> | null | undefined): string {
  if (!data || !Object.keys(data).length) return "";
  if (data.kind === "production_plan" && data.need_qty != null) return `Need ${data.need_qty} ${data.item ?? ""} by ${data.need_date ?? "—"}`.replace("  ", " ");
  if (data.kind === "inventory" && data.available != null)
    return `${data.available} ${data.item ?? ""} available${data.reserved ? ` · ${data.reserved} reserved` : ""}`.replace("  ", " ");
  return Object.entries(data)
    .filter(([k]) => k !== "kind")
    .map(([k, v]) => `${humanize(k)}: ${String(v)}`)
    .join(" · ");
}

export const OPERATION_LABELS: Record<string, string> = {
  set_risk_flag: "Set the sandbox risk flag",
};
export const opLabel = (op: string) => OPERATION_LABELS[op] ?? humanize(op);
