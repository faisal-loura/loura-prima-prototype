"use client";

import { useState } from "react";
import { Button, Callout } from "@blueprintjs/core";
import { useOp, type ViewData } from "@/lib/api";
import { Avatar, Time } from "@/components/ui/content";
import { EffectNote } from "@/components/ui/layout";
import { ParagraphDiff } from "./paragraph-diff";
import { CombinedEditDialog } from "./output-dialogs";

type OutputData = ViewData<"output">;
type Proposal = OutputData["proposals"][number];

/** An agent revision prepared from an older version waits here — it never replaces newer edits on its own. */
export function ProposalPanel({ data, proposal, onRefresh }: { data: OutputData; proposal: Proposal; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const apply = useOp("applyProposal", { success: (r) => `Applied the agent's revision as version ${r.version}`, silent: true });
  const keep = useOp("keepCurrentVersion", { success: `Kept version ${data.current_version}`, silent: true });
  const combined = useOp("applyCombined", { success: (r) => `Saved the combined version as version ${r.version}`, silent: true });

  const current = data.current_version;
  const currentContent = data.base_contents[current] ?? "";
  const stale = proposal.based_on !== current;
  const busy = apply.isPending || keep.isPending || combined.isPending;
  const err = apply.error ?? keep.error ?? null;

  return (
    <section className="rounded-xl border-2 border-brand/40 bg-card" aria-labelledby={`proposal-${proposal.id}`}>
      <header className="space-y-2 border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Avatar name={proposal.agent} kind="agent" size={22} />
          <h2 id={`proposal-${proposal.id}`} className="text-sm font-medium">
            {stale ? "Conflicting revision" : "Proposed revision"}
          </h2>
          <span className="text-xs text-muted-foreground">
            {proposal.agent} (agent) · <Time iso={proposal.created_at} />
          </span>
        </div>
        <p className="text-sm">
          {stale
            ? `The agent's proposed revision was prepared from version ${proposal.based_on}; version ${current} was saved since.`
            : `The agent proposed a revision of version ${proposal.based_on}.`}
        </p>
        {proposal.instruction && <p className="text-xs text-muted-foreground">Instruction: “{proposal.instruction}”</p>}
      </header>
      <div className="space-y-3 p-4">
        <ParagraphDiff
          left={currentContent}
          right={proposal.content}
          leftLabel="Your current version"
          leftMeta={`Version ${current}`}
          rightLabel="Agent's proposed revision"
          rightMeta={`Based on version ${proposal.based_on}`}
        />
        {err && (
          <Callout intent="danger" compact role="alert">
            {err.status === 409 ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                {err.message}
                <Button size="small" variant="outlined" text="Refresh comparison" onClick={onRefresh} />
              </span>
            ) : (
              err.message
            )}
          </Callout>
        )}
        {data.can_edit ? (
          <div className="flex flex-wrap gap-2">
            <Button
              intent="primary"
              text="Apply proposed revision"
              disabled={busy}
              loading={apply.isPending}
              onClick={() => {
                keep.reset();
                apply.mutate({ proposal_id: proposal.id, expected_current_version: current });
              }}
            />
            <Button
              variant="outlined"
              text="Keep current version"
              disabled={busy}
              loading={keep.isPending}
              onClick={() => {
                apply.reset();
                keep.mutate({ proposal_id: proposal.id });
              }}
            />
            <Button
              variant="outlined"
              icon="edit"
              text="Edit combined version"
              disabled={busy}
              onClick={() => {
                combined.reset();
                setEditing(true);
              }}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Someone who can edit this document decides what happens to this proposal.</p>
        )}
        <EffectNote>Nothing has been overwritten. Whichever you choose, both remain in history.</EffectNote>
      </div>
      <CombinedEditDialog
        isOpen={editing}
        onClose={() => setEditing(false)}
        initial={proposal.content}
        pending={combined.isPending}
        error={
          combined.error
            ? combined.error.status === 409
              ? `${combined.error.message} Your text here is kept. Check the refreshed comparison before saving again.`
              : combined.error.message
            : null
        }
        onSave={async (content) => {
          const r = await combined
            .mutateAsync({ proposal_id: proposal.id, content, expected_current_version: current })
            .catch(() => null);
          if (r) setEditing(false);
        }}
      />
    </section>
  );
}
