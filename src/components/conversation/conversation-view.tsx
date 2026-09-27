"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button, Callout, Icon, Spinner, Tab, Tabs, TextArea } from "@blueprintjs/core";
import { useClientKey, useOp, useView, type ViewData } from "@/lib/api";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/layout";
import { fmtDateTime, Markdown, Time } from "@/components/ui/content";
import { Pill, StatusTag } from "@/components/ui/status";
import { EscalationNote } from "@/components/requests/deadline";
import { cn } from "@/lib/utils";
import { OutputWorkspace } from "@/components/output/output-workspace";

type ConversationData = ViewData<"conversation">;
type Message = ConversationData["messages"][number];

export function ConversationView({ id }: { id: string }) {
  const q = useView("conversation", { id });
  const [panel, setPanel] = useState<"conversation" | "document">("conversation");

  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;

  // The active document is the one the conversation produced most recently.
  const activeOutputId =
    [...d.messages].reverse().find((m) => m.output)?.output?.id ?? d.outputs[d.outputs.length - 1]?.id ?? null;

  const header = (
    <header className="mb-8 space-y-1">
      <h1 className="min-w-0 text-[17px] font-medium leading-snug text-balance">{d.conversation.title}</h1>
      {d.task && (
        <Link href={`/tasks/${d.task.id}`} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline">
          Task: {d.task.title}
          <StatusTag kind="task" value={d.task.status} />
        </Link>
      )}
    </header>
  );

  if (!activeOutputId) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-3.5rem-5rem)] max-w-[700px] flex-col">
        {header}
        <ConversationPanel data={d} variant="page" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      {header}
      <div className="mb-4 lg:hidden">
        <Tabs id="conversation-panels" selectedTabId={panel} onChange={(t) => setPanel(t as typeof panel)}>
          <Tab id="conversation" title="Conversation" />
          <Tab id="document" title="Document" />
        </Tabs>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className={cn(panel !== "conversation" && "hidden", "min-w-0 lg:block")}>
          <ConversationPanel data={d} variant="side" />
        </div>
        <div className={cn(panel !== "document" && "hidden", "min-w-0 lg:block")}>
          <OutputWorkspace id={activeOutputId} compact />
        </div>
      </div>
    </div>
  );
}

/**
 * "page": the thread flows down the page with the composer pinned to the bottom of the window.
 * "side": beside a document, the thread scrolls inside its own column.
 */
function ConversationPanel({ data, variant }: { data: ConversationData; variant: "page" | "side" }) {
  const scroller = useRef<HTMLDivElement>(null);
  const lastId = data.messages[data.messages.length - 1]?.id;

  useEffect(() => {
    if (variant === "page") window.scrollTo({ top: document.documentElement.scrollHeight });
    else if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [lastId, data.working, variant]);

  return (
    <section aria-label="Conversation" className={cn("flex flex-1 flex-col", variant === "side" && "lg:sticky lg:top-20 lg:h-[calc(100vh-9rem)]")}>
      <div ref={scroller} className={cn("flex-1 space-y-3 pb-6", variant === "side" && "min-h-[240px] overflow-y-auto pr-1")} aria-live="polite">
        {data.messages.length === 0 ? (
          <EmptyState icon="chat" title="No messages yet" description="Ask a question to start." />
        ) : (
          data.messages.map((m) => (
            <MessageItem key={m.id} m={m} proposal={data.proposal?.message_id === m.id && data.task ? { ...data.proposal, task: data.task } : null} />
          ))
        )}
        {data.working && (
          <div role="status" className="flex">
            <div className="inline-flex items-center gap-2 rounded-3xl bg-secondary px-4 py-3 text-[15px] text-muted-foreground">
              <Spinner size={14} />
              {data.assignment?.agent ?? "The agent"} is working…
            </div>
          </div>
        )}
        {!data.working && data.last_run?.status === "Failed" && (
          <Callout intent="warning" compact icon="warning-sign">
            The agent&apos;s last run didn&apos;t finish, so there&apos;s no reply to your latest message. Send it again to retry.
          </Callout>
        )}
      </div>
      <div className={cn("pb-2", variant === "page" && "sticky bottom-6 z-10")}>
        {variant === "page" && <div className="pointer-events-none absolute inset-x-0 -bottom-6 -top-6 -z-10 bg-gradient-to-t from-background via-background to-transparent" aria-hidden />}
        {data.is_owner ? (
          <Composer conversationId={data.conversation.id} disabled={false} />
        ) : (
          <p className="rounded-2xl border bg-card px-4 py-3 text-xs text-muted-foreground">Only the owner can continue this conversation.</p>
        )}
      </div>
    </section>
  );
}

type Proposal = NonNullable<ConversationData["proposal"]> & { task: NonNullable<ConversationData["task"]> };

function MessageItem({ m, proposal }: { m: Message; proposal: Proposal | null }) {
  if (m.author_kind === "system") {
    return (
      <p className="py-1 text-center text-xs text-muted-foreground">
        {m.body} · <Time iso={m.created_at} />
      </p>
    );
  }
  const agent = m.author_kind === "agent";
  const who = m.is_me ? "You" : agent ? `${m.author} (agent)` : m.author;
  return (
    <article className={cn("flex flex-col", m.is_me ? "items-end" : "items-start")} aria-label={`${who}, ${fmtDateTime(m.created_at)}`}>
      {!m.is_me && !agent && <p className="mb-1 px-1 text-xs text-muted-foreground">{m.author}</p>}
      <div
        title={fmtDateTime(m.created_at)}
        className={cn(
          "max-w-[85%] text-left text-[15px] leading-relaxed",
          m.is_me ? "rounded-full bg-foreground px-4 py-2 text-white" : "rounded-3xl bg-secondary px-4 py-3 text-foreground",
          m.is_me && m.body.length > 60 && "rounded-3xl py-3",
        )}
      >
        {agent ? <Markdown>{m.body}</Markdown> : <p className="whitespace-pre-wrap">{m.body}</p>}
        {m.output && (
          <Link href={`/outputs/${m.output.id}`} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium hover:underline">
            <Icon icon="document" size={12} /> Open document: {m.output.title}
          </Link>
        )}
      </div>
      {m.simulated && <span className="mt-1 px-1 text-[11px] text-muted-foreground">Simulated reply</span>}
      {proposal && <div className="w-full max-w-[85%]"><ProposalCard p={proposal} /></div>}
    </article>
  );
}

/** The task the agent proposed in this message, and its approval request. Opens the request. */
function ProposalCard({ p }: { p: Proposal }) {
  const open = p.status === "Open";
  const state = open
    ? { tone: "agent" as const, text: p.is_recipient ? "Waiting for your approval" : "Waiting for approval" }
    : p.response_kind === "approve"
      ? { tone: "ok" as const, text: "Approved" }
      : p.response_kind === "decline"
        ? { tone: "muted" as const, text: "Declined" }
        : { tone: "muted" as const, text: p.status };
  return (
    <Link
      href={p.is_recipient && open ? `/inbox?request=${p.request_id}` : `/requests/${p.request_id}`}
      className={cn(
        "group mt-3 flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:border-input hover:bg-accent",
        open && "border-l-[3px] border-l-brand",
      )}
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", open ? "bg-brand/15 text-brand" : "bg-muted text-muted-foreground")}>
        <Icon icon="tick-circle" size={16} aria-hidden />
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className={cn("font-mono text-[10.5px] font-medium uppercase tracking-eyebrow", open ? "text-brand-strong" : "text-muted-foreground")}>
            Task approval
          </span>
          <Pill tone={state.tone}>{state.text}</Pill>
        </span>
        <span className="block truncate text-sm font-medium text-foreground">{p.task.title}</span>
        {open ? (
          <EscalationNote createdAt={p.created_at} className="text-xs" />
        ) : (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            Task <StatusTag kind="task" value={p.task.status} />
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
        {open && p.is_recipient ? "Review" : "View"} <Icon icon="chevron-right" size={12} aria-hidden />
      </span>
    </Link>
  );
}

function Composer({ conversationId, disabled }: { conversationId: string; disabled: boolean }) {
  const [text, setText] = useState("");
  const [key, rotate] = useClientKey();
  const ask = useOp("ask", { silent: true });

  async function send() {
    if (!text.trim() || ask.isPending) return;
    const r = await ask.mutateAsync({ conversation_id: conversationId, text, client_key: key }).catch(() => null);
    if (r) {
      setText("");
      rotate();
    }
  }

  const ready = Boolean(text.trim()) && !disabled;
  return (
    <div className="space-y-2">
      <div className="rounded-[28px] border bg-card shadow-[0_2px_10px_-4px_rgb(28_26_24/0.08)] transition-colors focus-within:border-input">
        <label htmlFor="conversation-reply" className="sr-only">
          Reply in this thread
        </label>
        <TextArea
          id="conversation-reply"
          fill
          rows={2}
          value={text}
          disabled={disabled}
          placeholder="Reply in this thread…"
          onChange={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
          className="!resize-none !border-0 !bg-transparent !px-5 !pt-4 !text-[15px] !shadow-none focus:!shadow-none"
        />
        <div className="flex items-center justify-between gap-2 px-3 pb-3">
          <Button variant="minimal" icon="paperclip" aria-label="Attach a file" title="Attachments aren't available yet" disabled className="!h-9 !w-9 !min-w-0 !rounded-full" />
          <button
            type="button"
            aria-label={ask.error ? "Retry send" : "Send"}
            title="Send (⌘↵)"
            onClick={() => void send()}
            disabled={!ready || ask.isPending}
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors",
              ready ? "bg-foreground hover:bg-foreground/85" : "bg-muted-foreground/70",
              ask.isPending && "animate-pulse",
            )}
          >
            <Icon icon={ask.error ? "refresh" : "arrow-up"} size={14} aria-hidden />
          </button>
        </div>
      </div>
      {ask.error && (
        <Callout intent="danger" compact role="alert">
          Your message wasn&apos;t sent: {ask.error.message} Your text is kept.
        </Callout>
      )}
    </div>
  );
}
