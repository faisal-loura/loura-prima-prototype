"use client";

import Link from "next/link";
import { Button } from "@blueprintjs/core";
import { useOp, type ViewData } from "@/lib/api";
import { EffectNote, EmptyState } from "@/components/ui/layout";
import { Time } from "@/components/ui/content";
import { cn } from "@/lib/utils";

type Update = ViewData<"inbox">["updates"][number];

export function UpdatesList({ updates }: { updates: Update[] }) {
  const mark = useOp("markUpdateRead");
  const unread = updates.filter((u) => !u.read_at).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {unread ? `${unread} unread` : "All caught up"}
        </p>
        <Button
          size="small"
          variant="outlined"
          icon="tick"
          text="Mark all read"
          disabled={!unread || mark.isPending}
          loading={mark.isPending && Boolean(mark.variables?.all)}
          onClick={() => mark.mutate({ all: true })}
        />
      </div>
      <div className="px-4 pt-3">
        <EffectNote>Updates are informational. Reading or dismissing one never answers a request.</EffectNote>
      </div>
      {updates.length === 0 ? (
        <EmptyState icon="notifications" title="No updates" description="Results of work you're involved in appear here, like answers to your questions or confirmed actions." />
      ) : (
        <ul className="divide-y">
          {updates.map((u) => (
            <li key={u.id} className={cn("flex gap-3 px-4 py-3", !u.read_at && "bg-brand/[0.03]")}>
              <span className="mt-1.5 flex w-2 shrink-0 justify-center">
                {!u.read_at && <span className="size-2 rounded-full bg-brand" aria-hidden />}
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className={cn("text-sm leading-snug", !u.read_at && "font-medium")}>
                  {!u.read_at && <span className="sr-only">Unread: </span>}
                  {u.link ? (
                    <Link href={u.link} className="hover:underline">
                      {u.title}
                    </Link>
                  ) : (
                    u.title
                  )}
                </p>
                {u.body && <p className="text-xs text-muted-foreground">{u.body}</p>}
                <Time iso={u.created_at} className="text-xs text-muted-foreground" />
              </div>
              {!u.read_at && (
                <Button
                  size="small"
                  variant="minimal"
                  text="Mark read"
                  className="shrink-0 self-start"
                  aria-label={`Mark “${u.title}” read`}
                  disabled={mark.isPending && mark.variables?.update_id === u.id}
                  onClick={() => mark.mutate({ update_id: u.id })}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
