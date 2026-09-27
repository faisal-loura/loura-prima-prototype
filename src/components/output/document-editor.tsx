"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Callout, SegmentedControl, TextArea } from "@blueprintjs/core";
import { useOp } from "@/lib/api";
import { Markdown, Time } from "@/components/ui/content";
import { cn } from "@/lib/utils";
import { ParagraphDiff } from "./paragraph-diff";

const AUTOSAVE_MS = 1200;

type SaveStatus = "idle" | "saving" | "saved" | "failed" | "conflict" | "keeping";

/**
 * Markdown editor with autosave. `base_version` is always the version this editor
 * loaded or last saved; a newer version saved elsewhere never overwrites the draft.
 */
export function DocumentEditor({
  outputId,
  serverVersion,
  serverContent,
  versionContents,
  loadedAt,
  onDirtyChange,
  onNeedRefresh,
  compact,
}: {
  outputId: string;
  serverVersion: number;
  serverContent: string;
  versionContents: Record<number, string>;
  loadedAt?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
  onNeedRefresh: () => Promise<Record<number, string> | undefined>;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState(serverContent);
  const [saved, setSaved] = useState<{ content: string; version: number; at: string | null }>({
    content: serverContent,
    version: serverVersion,
    at: loadedAt ?? null,
  });
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [failedDraft, setFailedDraft] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ current_version: number; message: string } | null>(null);
  const [comparing, setComparing] = useState(false);
  const [mode, setMode] = useState<"edit" | "preview" | "split">("edit");
  const [tick, setTick] = useState(0);

  const { mutateAsync: saveAsync } = useOp("saveOutput", { silent: true });
  const draftRef = useRef(draft);
  const savedRef = useRef(saved);
  const inflight = useRef(false);
  draftRef.current = draft;
  savedRef.current = saved;

  const dirty = draft !== saved.content;

  useEffect(() => {
    onDirtyChange?.(dirty || status === "saving");
  }, [dirty, status, onDirtyChange]);

  // Load newer versions only when there's nothing unsaved here.
  useEffect(() => {
    if (inflight.current || conflict) return;
    if (serverVersion > savedRef.current.version && draftRef.current === savedRef.current.content) {
      setDraft(serverContent);
      setSaved({ content: serverContent, version: serverVersion, at: loadedAt ?? null });
      setStatus("idle");
    }
  }, [serverVersion, serverContent, loadedAt, conflict]);

  const save = useCallback(
    async (baseOverride?: number) => {
      if (inflight.current) return;
      const content = draftRef.current;
      const base = baseOverride ?? savedRef.current.version;
      inflight.current = true;
      setStatus("saving");
      setError(null);
      try {
        const r = await saveAsync({ output_id: outputId, content, base_version: base });
        if (r.status === "conflict") {
          setConflict({ current_version: r.current_version, message: r.message });
          setStatus("conflict");
        } else {
          setSaved({ content, version: r.version, at: r.saved_at });
          setConflict(null);
          setComparing(false);
          setFailedDraft(null);
          setStatus("saved");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "The save didn't complete.");
        setFailedDraft(content);
        setStatus("failed");
      } finally {
        inflight.current = false;
        setTick((t) => t + 1);
      }
    },
    [outputId, saveAsync],
  );

  // Debounced autosave.
  useEffect(() => {
    if (!dirty || inflight.current || status === "conflict" || status === "keeping") return;
    if (status === "failed" && draft === failedDraft) return;
    const t = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [draft, dirty, status, failedDraft, tick, save]);

  // Warn before leaving with unsaved changes.
  const unsaved = dirty || status === "saving";
  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.origin !== window.location.origin) return;
      if (a.pathname === window.location.pathname && a.search === window.location.search) return;
      if (!window.confirm("Your latest changes haven't been saved yet. Leave this page anyway?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("click", onClick, true);
    };
  }, [unsaved]);

  async function discard() {
    if (!conflict) return;
    const v = conflict.current_version;
    let content: string | undefined = versionContents[v];
    if (content === undefined) content = (await onNeedRefresh())?.[v];
    const next = content ?? serverContent;
    setDraft(next);
    setSaved({ content: next, version: content === undefined ? serverVersion : v, at: null });
    setConflict(null);
    setComparing(false);
    setStatus("idle");
  }

  const conflictContent = conflict ? versionContents[conflict.current_version] : undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          size="small"
          aria-label="Editor view"
          value={mode}
          onValueChange={(v) => setMode(v as typeof mode)}
          options={[
            { label: "Edit", value: "edit" },
            { label: "Preview", value: "preview" },
            ...(compact ? [] : [{ label: "Side by side", value: "split" }]),
          ]}
        />
        <SaveState status={status} dirty={dirty} saved={saved} error={error} onRetry={() => void save()} />
      </div>

      {conflict && status === "conflict" && (
        <Callout intent="warning" title="Your changes aren't saved yet" icon="warning-sign">
          <p className="mb-2 text-sm">{conflict.message}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="small"
              variant="outlined"
              icon="comparison"
              text={comparing ? "Hide comparison" : `Compare with version ${conflict.current_version}`}
              onClick={() => {
                if (!comparing && conflictContent === undefined) void onNeedRefresh();
                setComparing(!comparing);
              }}
            />
            <Button size="small" variant="outlined" icon="edit" text="Keep editing my text" onClick={() => setStatus("keeping")} />
            <Button size="small" variant="minimal" intent="danger" icon="undo" text="Discard my changes" onClick={() => void discard()} />
          </div>
        </Callout>
      )}

      {conflict && status === "keeping" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            Autosave is paused. Your text will be saved as a new version after version {conflict.current_version}.
          </span>
          <div className="flex gap-2">
            <Button
              size="small"
              variant="minimal"
              icon="comparison"
              text={comparing ? "Hide comparison" : "Compare"}
              onClick={() => {
                if (!comparing && conflictContent === undefined) void onNeedRefresh();
                setComparing(!comparing);
              }}
            />
            <Button size="small" intent="primary" text="Save as new version" onClick={() => void save(conflict.current_version)} />
          </div>
        </div>
      )}

      {conflict && comparing && (
        <ParagraphDiff
          left={conflictContent ?? ""}
          right={draft}
          leftLabel={`Version ${conflict.current_version} (saved)`}
          rightLabel="Your draft (not saved)"
          leftMeta={conflictContent === undefined ? "Loading…" : undefined}
        />
      )}

      <div className={cn(mode === "split" && "grid gap-3 xl:grid-cols-2")}>
        {mode !== "preview" && (
          <div>
            <label htmlFor={`editor-${outputId}`} className="sr-only">
              Document content (Markdown)
            </label>
            <TextArea
              id={`editor-${outputId}`}
              fill
              value={draft}
              onChange={(e) => setDraft(e.currentTarget.value)}
              className={cn("!font-mono !text-[13px] !leading-relaxed", compact ? "!min-h-[360px]" : "!min-h-[520px]")}
              spellCheck
            />
          </div>
        )}
        {mode !== "edit" && (
          <div className={cn("rounded-lg border bg-card p-4", compact ? "min-h-[360px]" : "min-h-[520px]")}>
            {draft.trim() ? <Markdown>{draft}</Markdown> : <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function SaveState({
  status,
  dirty,
  saved,
  error,
  onRetry,
}: {
  status: SaveStatus;
  dirty: boolean;
  saved: { version: number; at: string | null };
  error: string | null;
  onRetry: () => void;
}) {
  let content: React.ReactNode;
  if (status === "saving") content = <span>Saving…</span>;
  else if (status === "failed")
    content = (
      <span className="inline-flex flex-wrap items-center gap-2 text-blocked">
        <span title={error ?? undefined}>Save failed — your changes are kept.</span>
        <Button size="small" variant="outlined" text="Retry" onClick={onRetry} />
      </span>
    );
  else if (status === "conflict" || status === "keeping") content = <span className="text-risk">Not saved — a newer version exists</span>;
  else if (dirty) content = <span>Unsaved changes</span>;
  else if (saved.at)
    content = (
      <span>
        Saved · version {saved.version} · <Time iso={saved.at} />
      </span>
    );
  else content = <span>Version {saved.version}</span>;
  return (
    <div aria-live="polite" role="status" className="text-xs text-muted-foreground">
      {content}
    </div>
  );
}
