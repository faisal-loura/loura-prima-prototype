"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Callout, Menu, MenuDivider, MenuItem, Popover, TextArea } from "@blueprintjs/core";
import { useClientKey, useOp } from "@/lib/api";
import { cn } from "@/lib/utils";

export function AskComposer() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [key, rotate] = useClientKey();
  const ask = useOp("ask", { silent: true });

  async function send() {
    if (!text.trim() || ask.isPending) return;
    // The same client key is reused on retry, so a send that did reach the server isn't duplicated.
    const r = await ask.mutateAsync({ text, client_key: key }).catch(() => null);
    if (r) {
      rotate();
      router.push(`/conversations/${r.conversation_id}`);
    }
  }

  const ready = Boolean(text.trim());

  return (
    <div className="rounded-[28px] border bg-card shadow-[0_2px_10px_-4px_rgb(28_26_24/0.08)] transition-colors focus-within:border-input">
      <label htmlFor="ask-text" className="sr-only">
        Ask a question or describe a task
      </label>
      <TextArea
        id="ask-text"
        fill
        rows={2}
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void send();
          }
        }}
        placeholder="Ask a question or describe a task…"
        className="!resize-none !border-0 !bg-transparent !px-5 !pt-5 !text-[15px] !shadow-none focus:!shadow-none"
      />
      <div className="flex items-center justify-between gap-2 px-3 pb-3">
        <Popover
          placement="bottom-start"
          minimal
          content={
            <Menu>
              <MenuDivider title="Create" />
              <MenuItem icon="document" text="Document" onClick={() => router.push("/?create=document")} />
              <MenuItem icon="flow-linear" text="Case from a procedure" onClick={() => router.push("/?create=case")} />
              <MenuItem icon="predictive-analysis" text="Agent assignment" onClick={() => router.push("/assignments/new")} />
            </Menu>
          }
        >
          <Button variant="minimal" icon="plus" aria-label="Create" className="!h-9 !w-9 !min-w-0 !rounded-full" />
        </Popover>
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
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
            {ask.error ? (
              <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5V5h-2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </button>
      </div>
      {ask.error && (
        <div className="px-4 pb-4">
          <Callout intent="danger" compact role="alert">
            Your message wasn&apos;t sent: {ask.error.message} Your text is kept.
          </Callout>
        </div>
      )}
    </div>
  );
}
