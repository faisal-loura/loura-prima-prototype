"use client";

import { Icon } from "@blueprintjs/core";
import type { ViewData } from "@/lib/api";
import { StatusTag } from "@/components/ui/status";
import { Time } from "@/components/ui/content";
import { cn } from "@/lib/utils";
import { requestTypeInfo, responseWords } from "./labels";
import { EscalationNote } from "./deadline";

export type RequestSummary = ViewData<"inbox">["needs"][number];

export function RequestRow({
  item,
  selected,
  onSelect,
  showStatus = false,
}: {
  item: RequestSummary;
  selected: boolean;
  onSelect: (id: string) => void;
  showStatus?: boolean;
}) {
  const info = requestTypeInfo(item.kind);
  const pending = item.status === "Open";
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(item.id)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "relative flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
          selected && "bg-muted",
        )}
      >
        {(selected || pending) && (
          <span className={cn("absolute inset-y-2 left-0 rounded-full", pending ? "w-1 bg-brand-strong" : "w-0.5 bg-brand")} aria-hidden />
        )}
        <span className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-eyebrow",
              pending ? "font-semibold text-brand-strong" : "text-muted-foreground",
            )}
          >
            <Icon icon={info.icon} size={11} aria-hidden />
            {info.label}
          </span>
          <Time iso={item.created_at} className="shrink-0 text-xs text-muted-foreground" />
        </span>
        <span className="line-clamp-2 text-sm leading-snug text-foreground">{item.question}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="truncate">{item.subject}</span>
          <span aria-hidden>·</span>
          <span>From {item.requester}</span>
          {pending && (
            <>
              <span aria-hidden>·</span>
              <EscalationNote createdAt={item.created_at} />
            </>
          )}
          {showStatus && (
            <>
              <StatusTag kind="request" value={item.status} />
              {item.response_kind && <span>{responseWords(item.response_kind)}</span>}
            </>
          )}
        </span>
      </button>
    </li>
  );
}
