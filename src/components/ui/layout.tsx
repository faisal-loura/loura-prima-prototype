"use client";

import Link from "next/link";
import { Button, Classes, Icon, NonIdealState } from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";
import { cn } from "@/lib/utils";
import type { ApiError } from "@/lib/api";

/** Mono uppercase label for technical metadata. */
export function Eyebrow({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("font-mono text-[11px] font-medium uppercase tracking-eyebrow text-muted-foreground", className)}
      {...props}
    />
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  meta,
  actions,
  back,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-6 space-y-2">
      {back && (
        <Link href={back.href} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <Icon icon="chevron-left" size={12} /> {back.label}
        </Link>
      )}
      {eyebrow && <div>{typeof eyebrow === "string" ? <Eyebrow>{eyebrow}</Eyebrow> : eyebrow}</div>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <h1 className="font-display text-3xl leading-tight text-balance md:text-4xl">{title}</h1>
          {subtitle && <p className="max-w-3xl text-sm text-muted-foreground">{subtitle}</p>}
          {meta && <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs text-muted-foreground">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
  padded = true,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  padded?: boolean;
}) {
  return (
    <section className={cn("rounded-xl border bg-card", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-medium">{title}</h2>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className={cn(padded && "p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function EmptyState({ icon = "inbox", title, description, action }: { icon?: IconName; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <Icon icon={icon} size={20} className="text-muted-foreground" />
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

export function LoadingState({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className={cn(Classes.SKELETON, "h-7 w-1/3 rounded")} />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cn(Classes.SKELETON, "h-16 w-full rounded-lg")} />
      ))}
    </div>
  );
}

/** Denied and missing look the same: no restricted title, excerpt, or activity leaks. */
export function ErrorState({ error, onRetry }: { error: ApiError | Error | null; onRetry?: () => void }) {
  const status = (error as ApiError | null)?.status ?? 500;
  const denied = status === 403 || status === 404;
  return (
    <div className="rounded-xl border bg-card">
      <NonIdealState
        icon={denied ? "lock" : "error"}
        title={denied ? "You can't open this" : "This couldn't be loaded"}
        description={error?.message ?? "Try again."}
        action={
          <div className="flex gap-2">
            {!denied && onRetry && <Button text="Try again" onClick={onRetry} />}
            <Link href="/" className={cn(Classes.BUTTON, Classes.MINIMAL)}>
              Go to Home
            </Link>
          </div>
        }
      />
    </div>
  );
}

export function KeyValue({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-2 text-sm">
      {items.map((i) => (
        <div key={i.label} className="contents">
          <dt className="text-muted-foreground">{i.label}</dt>
          <dd className="min-w-0">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Explains what an action does — and doesn't — before or after it runs. */
export function EffectNote({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warn" }) {
  return (
    <p
      className={cn(
        "flex gap-2 rounded-md px-3 py-2 text-xs leading-relaxed",
        tone === "warn" ? "bg-risk-soft text-risk" : "bg-muted text-muted-foreground",
      )}
    >
      <Icon icon="info-sign" size={12} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
