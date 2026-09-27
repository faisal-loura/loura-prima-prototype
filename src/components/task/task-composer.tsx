"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Callout, Icon, Spinner, TextArea } from "@blueprintjs/core";
import { useClientKey, useOp, type ViewData } from "@/lib/api";
import { Panel } from "@/components/ui/layout";
import { Avatar, RecordLink, Time } from "@/components/ui/content";
import { StatusTag } from "@/components/ui/status";
import { cn } from "@/lib/utils";

type TaskView = ViewData<"task">;

/**
 * The agent card: who is working on the task, its state, and a composer that
 * continues the conversation the task came from.
 */
export function TaskComposer({ d }: { d: TaskView }) {
  const c = d.conversation;
  const [text, setText] = useState("");
  const [key, rotate] = useClientKey();
  const ask = useOp("ask", { silent: true });

  async function send() {
    if (!c || !text.trim() || ask.isPending) return;
    // The same client key is reused on retry, so a send that reached the server isn't duplicated.
    const r = await ask.mutateAsync({ conversation_id: c.id, text, client_key: key }).catch(() => null);
    if (r) {
      setText("");
      rotate();
    }
  }

  const agentName = d.assignment?.agent ?? d.performer ?? "Agent";
  return (
    <Panel
      title={
        <span className="flex flex-wrap items-center gap-2">
          <Avatar name={agentName} kind="agent" size={22} />
          <span>{agentName}</span>
          {d.assignment && <StatusTag kind="assignment" value={d.assignment.status} />}
        </span>
      }
      actions={
        c && (
          <Link href={`/conversations/${c.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            Full conversation <Icon icon="arrow-right" size={10} />
          </Link>
        )
      }
      padded={false}
      className="overflow-hidden rounded-3xl"
    >
      <div className="space-y-1.5 px-4 py-3">
        {d.unmet.length > 0 ? (
          <p className="text-sm font-medium text-brand-strong">Blocked — see the completion conditions above.</p>
        ) : d.assignment ? (
          d.assignment.condition && <p className="text-sm text-muted-foreground">{d.assignment.condition}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {d.approval ? "Starts once the task is approved." : "No agent is working on this task."}
          </p>
        )}
        {d.assignment && (
          <RecordLink href={`/assignments/${d.assignment.id}`} className="text-xs">
            Open assignment
          </RecordLink>
        )}
      </div>
      {c && c.messages.length > 0 && (
        <ul className="max-h-72 space-y-3 overflow-y-auto border-t px-4 py-3" aria-live="polite">
          {c.messages.map((m) => {
            const agent = m.author_kind === "agent";
            return (
              <li key={m.id} className={cn("flex gap-2", m.is_me && "flex-row-reverse")}>
                <Avatar name={m.author} kind={agent ? "agent" : "person"} size={20} />
                <div
                  className={cn(
                    "min-w-0 max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs leading-relaxed",
                    agent ? "bg-muted" : m.is_me ? "bg-secondary" : "border bg-card",
                  )}
                >
                  <p className="line-clamp-5 whitespace-pre-wrap">{m.body}</p>
                  <Time iso={m.created_at} className="mt-0.5 block text-[10px] text-muted-foreground" />
                </div>
              </li>
            );
          })}
          {c.working && (
            <li role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner size={12} /> The agent is working…
            </li>
          )}
        </ul>
      )}
      {!c ? null : c.is_owner ? (
        <div className="space-y-2 border-t p-3">
          <div className="glass rounded-2xl border transition-colors focus-within:border-input">
            <label htmlFor={`task-ask-${d.task.id}`} className="sr-only">
              Message the agent about this task
            </label>
            <TextArea
              id={`task-ask-${d.task.id}`}
              fill
              rows={2}
              value={text}
              placeholder="Ask about this task…"
              onChange={(e) => setText(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void send();
                }
              }}
              className="!resize-none !border-0 !bg-transparent !px-3.5 !pt-3 !text-sm !shadow-none focus:!shadow-none"
            />
            <div className="flex items-center justify-end gap-2 px-2.5 pb-2">
              <span className="font-mono text-[10px] text-muted-foreground">⌘ ↵</span>
              <Button
                intent="primary"
                icon={ask.error ? "refresh" : "arrow-up"}
                aria-label={ask.error ? "Retry send" : "Send"}
                className="!h-7 !w-7 !min-w-0 !rounded-full !p-0"
                disabled={!text.trim()}
                loading={ask.isPending}
                onClick={() => void send()}
              />
            </div>
          </div>
          {ask.error && (
            <Callout intent="danger" compact role="alert">
              Not sent: {ask.error.message} Your text is kept.
            </Callout>
          )}
        </div>
      ) : (
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">Only the person who started this conversation can message the agent here.</p>
      )}
    </Panel>
  );
}
