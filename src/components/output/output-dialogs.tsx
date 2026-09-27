"use client";

import { useState } from "react";
import { Button, Callout, Checkbox, Dialog, DialogBody, DialogFooter, Drawer, FormGroup, HTMLSelect, TextArea } from "@blueprintjs/core";
import { useOp, type ViewData } from "@/lib/api";
import { useShell } from "@/components/shell/shell-context";
import { EffectNote } from "@/components/ui/layout";
import { Time } from "@/components/ui/content";
import { Pill, StatusTag } from "@/components/ui/status";
import { cn } from "@/lib/utils";

type OutputData = ViewData<"output">;
type Props = { data: OutputData; isOpen: boolean; onClose: () => void };

/** Everyone who can currently see the document — used to warn before asking someone who can't. */
export function audienceIds(data: OutputData) {
  const ids = new Set<string>(data.audience.grants.map((g) => g.user_id));
  if (data.audience.owner.user_id) ids.add(data.audience.owner.user_id);
  return ids;
}

export function VersionsDrawer({
  data,
  isOpen,
  onClose,
  viewingVersion,
  onOpenVersion,
}: Props & { viewingVersion: number; onOpenVersion: (v: number) => void }) {
  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Versions" icon="history" size="min(92vw, 420px)">
      <div className="overflow-y-auto p-4">
        <p className="mb-3 text-xs text-muted-foreground">Earlier versions open read-only. Nothing is removed from history.</p>
        <ol className="space-y-2">
          {data.versions.map((v) => {
            const current = v.version === data.current_version;
            const viewing = v.version === viewingVersion;
            return (
              <li key={v.version}>
                <button
                  type="button"
                  onClick={() => onOpenVersion(v.version)}
                  aria-current={viewing ? "true" : undefined}
                  className={cn(
                    "w-full rounded-lg border bg-card px-3 py-2 text-left hover:bg-muted/60",
                    viewing && "border-brand/60",
                  )}
                >
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">Version {v.version}</span>
                    {current && <Pill tone="strong">Current</Pill>}
                    {viewing && !current && <Pill tone="neutral">Viewing</Pill>}
                    {v.locked && (
                      <Pill tone="muted" icon="lock" title="Locked for review or agent use. Edits create a new version.">
                        Locked
                      </Pill>
                    )}
                    {v.reviewed.map((s, i) => (
                      <StatusTag key={i} kind="review" value={s} />
                    ))}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {v.author}
                    {v.author_kind === "agent" && " (agent)"} · <Time iso={v.updated_at ?? v.created_at} />
                  </span>
                  {v.note && <span className="mt-1 block text-xs">{v.note}</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </Drawer>
  );
}

export function RequestReviewDialog({ data, isOpen, onClose }: Props) {
  const shell = useShell();
  const [version, setVersion] = useState(String(data.current_version));
  const [reviewers, setReviewers] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const req = useOp("requestReview", { success: (r) => (r ? `Review requested for version ${version}` : null), silent: true });
  const visible = audienceIds(data);
  const people = (shell?.members ?? []).filter((m) => m.status === "active" && m.user_id !== shell?.me.user_id);

  async function submit() {
    const r = await req
      .mutateAsync({ output_id: data.output.id, version: Number(version), reviewer_ids: reviewers, note })
      .catch(() => null);
    if (r) {
      setReviewers([]);
      setNote("");
      onClose();
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      onOpening={() => setVersion(String(data.current_version))}
      title="Request review"
      icon="endorsed"
      style={{ width: "min(94vw, 540px)" }}>
      <DialogBody>
        <FormGroup label="Version" labelFor="review-version">
          <HTMLSelect
            id="review-version"
            fill
            value={version}
            onChange={(e) => setVersion(e.currentTarget.value)}
            options={data.versions.map((v) => ({
              value: String(v.version),
              label: `Version ${v.version}${v.version === data.current_version ? " (current)" : ""} — ${v.author}`,
            }))}
          />
        </FormGroup>
        <fieldset className="mb-4">
          <legend className="mb-1.5 text-sm">Required reviewers</legend>
          <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-md border p-2">
            {people.map((p) => {
              const canSee = visible.has(p.user_id);
              return (
                <Checkbox
                  key={p.user_id}
                  className="!mb-1"
                  checked={reviewers.includes(p.user_id)}
                  onChange={(e) => setReviewers(e.currentTarget.checked ? [...reviewers, p.user_id] : reviewers.filter((x) => x !== p.user_id))}
                  labelElement={
                    <span>
                      {p.full_name}
                      {!canSee && <span className="ml-1.5 text-xs text-risk">Can&apos;t see this document yet — share it first</span>}
                    </span>
                  }
                />
              );
            })}
          </div>
        </fieldset>
        <FormGroup label="Note (optional)" labelFor="review-note">
          <TextArea id="review-note" fill rows={3} value={note} onChange={(e) => setNote(e.currentTarget.value)} />
        </FormGroup>
        <EffectNote>Submitting selects this version for a decision. It doesn&apos;t change who can see the document.</EffectNote>
        {req.error && (
          <Callout intent="danger" compact className="mt-3" role="alert">
            {req.error.message}
          </Callout>
        )}
      </DialogBody>
      <DialogFooter
        actions={
          <>
            <Button variant="minimal" text="Cancel" onClick={onClose} />
            <Button
              intent="primary"
              text={`Request review of version ${version}`}
              disabled={!reviewers.length}
              loading={req.isPending}
              onClick={() => void submit()}
            />
          </>
        }
      />
    </Dialog>
  );
}

export function ReviseDialog({ data, isOpen, onClose }: Props) {
  const [instruction, setInstruction] = useState("");
  const revise = useOp("askAgentToRevise", { success: `Asked the agent to revise version ${data.current_version}`, silent: true });

  async function submit() {
    const r = await revise.mutateAsync({ output_id: data.output.id, instruction }).catch(() => null);
    if (r) {
      setInstruction("");
      onClose();
    }
  }

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Ask agent to revise" icon="predictive-analysis" style={{ width: "min(94vw, 520px)" }}>
      <DialogBody>
        <FormGroup label="What should change?" labelFor="revise-instruction">
          <TextArea
            id="revise-instruction"
            autoFocus
            fill
            rows={4}
            value={instruction}
            onChange={(e) => setInstruction(e.currentTarget.value)}
          />
        </FormGroup>
        <EffectNote>
          The agent works from version {data.current_version}. If a newer version is saved meanwhile, its result is kept as a proposal
          for you to compare — nothing is overwritten.
        </EffectNote>
        {revise.error && (
          <Callout intent="danger" compact className="mt-3" role="alert">
            {revise.error.message}
          </Callout>
        )}
      </DialogBody>
      <DialogFooter
        actions={
          <>
            <Button variant="minimal" text="Cancel" onClick={onClose} />
            <Button intent="primary" text="Ask agent" disabled={!instruction.trim()} loading={revise.isPending} onClick={() => void submit()} />
          </>
        }
      />
    </Dialog>
  );
}

export function CombinedEditDialog({
  isOpen,
  onClose,
  initial,
  onSave,
  pending,
  error,
}: {
  isOpen: boolean;
  onClose: () => void;
  initial: string;
  onSave: (content: string) => void;
  pending: boolean;
  error: string | null;
}) {
  const [content, setContent] = useState(initial);
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      onOpening={() => setContent(initial)}
      title="Edit combined version"
      icon="edit"
      style={{ width: "min(96vw, 900px)" }}
    >
      <DialogBody>
        <p className="mb-2 text-xs text-muted-foreground">Starts from the agent&apos;s proposed revision. Saving creates a new version.</p>
        <label htmlFor="combined-content" className="sr-only">
          Combined document content (Markdown)
        </label>
        <TextArea
          id="combined-content"
          fill
          value={content}
          onChange={(e) => setContent(e.currentTarget.value)}
          className="!min-h-[420px] !font-mono !text-[13px] !leading-relaxed"
        />
        {error && (
          <Callout intent="danger" compact className="mt-3" role="alert">
            {error}
          </Callout>
        )}
      </DialogBody>
      <DialogFooter
        actions={
          <>
            <Button variant="minimal" text="Cancel" onClick={onClose} />
            <Button intent="primary" text="Save combined version" loading={pending} onClick={() => onSave(content)} />
          </>
        }
      />
    </Dialog>
  );
}
