"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Dialog, DialogBody, DialogFooter, FormGroup, Icon, Spinner, TextArea } from "@blueprintjs/core";
import { useOp, type ViewData } from "@/lib/api";
import { EffectNote, Eyebrow } from "@/components/ui/layout";
import { Avatar } from "@/components/ui/content";
import { Pill, StatusTag } from "@/components/ui/status";
import { ConfirmButton, InlineError, ResultNote } from "@/components/ui/common";
import { BlockerCard } from "@/components/ui/blocker";

export type AssignmentData = ViewData<"assignment">;

export function AssignmentHeader({ d }: { d: AssignmentData }) {
  const a = d.assignment;
  const stopping = a.status === "Pausing" || a.status === "Ending";

  return (
    <header className="mb-6 space-y-3">
      <Link href="/my-work?tab=assignments" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <Icon icon="chevron-left" size={12} /> Agent assignments
      </Link>
      <div>
        <Eyebrow>Agent assignment · {a.kind === "ongoing" ? "Ongoing" : "Contribution"}</Eyebrow>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-normal leading-tight tracking-tight text-balance">{a.purpose}</h1>
          <div className="flex flex-wrap items-center gap-2" aria-live="polite">
            <StatusTag kind="assignment" value={a.status} />
            {!d.waiting_on.length && <span className="text-sm font-medium">{a.condition}</span>}
          </div>
          {stopping && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner size={12} /> {a.status === "Pausing" ? "Pausing…" : "Ending…"} Waiting for the current run to reach its stop boundary
            </p>
          )}
          {a.status === "Paused" && <PausedReceipt d={d} />}
        </div>
        {d.can_intervene && <Controls d={d} />}
      </div>

      {d.waiting_on.map((w) => (
        <BlockerCard
          key={w.id}
          label="Waiting for another task"
          title={w.title}
          aside={
            <Link href={`/tasks/${w.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-strong hover:underline">
              Open that task <Icon icon="arrow-right" size={12} />
            </Link>
          }
        >
          <p className="text-xs text-muted-foreground">The agent won&apos;t start until that task is done.</p>
        </BlockerCard>
      ))}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span className="inline-flex items-center gap-1.5">
          <Avatar name={d.agent.name} kind="agent" size={20} />
          {d.agent.name} <span className="text-xs text-muted-foreground">(agent)</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Avatar name={d.responsible} size={20} />
          <span>
            {d.responsible} <span className="text-xs text-muted-foreground">responsible</span>
          </span>
          {!d.responsible_active && (
            <Pill tone="danger" icon="warning-sign">
              No longer has access — actions pause
            </Pill>
          )}
        </span>
        {d.task && <HeaderLink href={`/tasks/${d.task.id}`} icon="tick-circle" label={`Task: ${d.task.title}`} />}
        {d.conversation_id && <HeaderLink href={`/conversations/${d.conversation_id}`} icon="chat" label="Conversation" />}
        {d.output && <HeaderLink href={`/outputs/${d.output.id}`} icon="document" label={d.output.title} />}
      </div>
      {!d.can_intervene && (
        <p className="text-xs text-muted-foreground">
          You can inspect this assignment. Only its responsible person, whoever started it, or a supervisor can pause, end, or change it.
        </p>
      )}
    </header>
  );
}

function HeaderLink({ href, icon, label }: { href: string; icon: "flag" | "tick-circle" | "chat" | "document"; label: string }) {
  return (
    <Link href={href} className="inline-flex max-w-full items-center gap-1 text-sm hover:underline">
      <Icon icon={icon} size={12} className="text-muted-foreground" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function PausedReceipt({ d }: { d: AssignmentData }) {
  if (!d.connection) return null;
  const receiving = d.connection.events_available;
  const held = d.events.filter((e) => e.this_assignment && e.status === "Held").length;
  return (
    <p className="text-xs text-muted-foreground">
      {receiving
        ? `Actions paused. Updates from ${d.connection.name} are still received and held${held ? ` (${held} held so far)` : ""}; nothing is acted on until you resume.`
        : `Actions paused, and updates aren't being received: observation of ${d.connection.name} is unavailable.`}
    </p>
  );
}

function Controls({ d }: { d: AssignmentData }) {
  const a = d.assignment;
  const id = a.id;
  const pause = useOp("pauseAssignment", { success: "Pause requested. Stops at the next boundary." });
  const resume = useOp("resumeAssignment", { success: "Resumed. Loura is reassessing the current situation." });
  const end = useOp("endAssignment", { success: "End requested. Stops at the next boundary." });
  const activate = useOp("activateDraft", { success: "Draft activated. The first assessment is starting." });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {a.status === "Draft" && (
        <ConfirmButton
          text="Activate"
          icon="play"
          variant="solid"
          title="Activate this draft"
          body={<EffectNote>Starts the assignment and runs the first assessment now.</EffectNote>}
          onConfirm={() => activate.mutateAsync({ assignment_id: id })}
          loading={activate.isPending}
          error={activate.error}
        />
      )}
      {a.status === "Active" && (
        <ConfirmButton
          text="Pause"
          icon="pause"
          title="Pause this assignment"
          body={<EffectNote>Stops new actions once the current step reaches its boundary. Earlier actions and results are not undone.</EffectNote>}
          onConfirm={() => pause.mutateAsync({ assignment_id: id })}
          loading={pause.isPending}
          error={pause.error}
        />
      )}
      {a.status === "Paused" && (
        <ConfirmButton
          text="Resume"
          icon="play"
          variant="solid"
          title="Resume this assignment"
          body={<EffectNote>Loura reassesses the current situation first. Earlier approvals that weren&apos;t carried out are not replayed.</EffectNote>}
          onConfirm={() => resume.mutateAsync({ assignment_id: id })}
          loading={resume.isPending}
          error={resume.error}
        />
      )}
      {!["Ended", "Ending"].includes(a.status) && <ChangeInstructions d={d} />}
      {!["Ended", "Ending"].includes(a.status) && (
        <ConfirmButton
          text="End"
          icon="stop"
          intent="danger"
          title="End this assignment"
          body={<EffectNote>Ends this assignment. Earlier actions and any uncertain results stay visible.</EffectNote>}
          onConfirm={() => end.mutateAsync({ assignment_id: id })}
          loading={end.isPending}
          error={end.error}
        />
      )}
    </div>
  );
}

function ChangeInstructions({ d }: { d: AssignmentData }) {
  const a = d.assignment;
  const pending = (a.scope as Record<string, unknown>).pending_instructions as string | undefined;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(pending ?? a.instructions);
  const [result, setResult] = useState<string | null>(null);
  const change = useOp("changeInstructions", {
    silent: true,
    success: (r) => (r.status === "pending" ? "Instructions changed — applies after the current run" : "Instructions changed — effective now"),
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await change.mutateAsync({ assignment_id: a.id, instructions: text }).catch(() => null);
    if (r) setResult(r.status === "pending" ? "Applies after the current run" : "Effective now");
  }

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        icon="edit"
        text="Change instructions"
        onClick={() => {
          setText(pending ?? a.instructions);
          setResult(null);
          change.reset();
          setOpen(true);
        }}
      />
      <Dialog isOpen={open} onClose={() => setOpen(false)} title="Change instructions" icon="edit">
        <form onSubmit={submit}>
          <DialogBody className="space-y-3">
            <FormGroup label="Instructions for this assignment" labelFor="asg-instructions" className="!mb-0">
              <TextArea id="asg-instructions" fill rows={6} value={text} onChange={(e) => setText(e.currentTarget.value)} autoFocus />
            </FormGroup>
            <EffectNote>This changes this assignment only — not the reusable agent definition. If a run is executing, the change applies after it finishes.</EffectNote>
            <InlineError error={change.error} />
            {result && <ResultNote>{result}</ResultNote>}
          </DialogBody>
          <DialogFooter
            actions={
              result ? (
                <Button intent="primary" text="Close" onClick={() => setOpen(false)} />
              ) : (
                <>
                  <Button variant="minimal" text="Cancel" onClick={() => setOpen(false)} />
                  <Button type="submit" intent="primary" text="Save instructions" loading={change.isPending} disabled={!text.trim() || text.trim() === a.instructions.trim()} />
                </>
              )
            }
          />
        </form>
      </Dialog>
    </>
  );
}
