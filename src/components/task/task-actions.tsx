"use client";

import { useState } from "react";
import { Button, Callout, Dialog, DialogBody, DialogFooter, FormGroup, TextArea } from "@blueprintjs/core";
import { useOp, type ViewData } from "@/lib/api";

type TaskView = ViewData<"task">;

const PRIMARY = "h-10 rounded-full bg-foreground px-5 text-[15px] font-medium text-white transition-colors hover:bg-foreground/85 disabled:cursor-not-allowed disabled:opacity-40";
const SECONDARY = "h-10 rounded-full border bg-card px-5 text-[15px] font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-40";
const QUIET = "h-10 rounded-full px-4 text-[15px] font-medium text-foreground transition-colors hover:bg-accent";

export function TaskActions({ d }: { d: TaskView }) {
  const t = d.task;
  const closed = t.status === "Done" || t.status === "Cancelled";
  return (
    <>
      {!closed && d.is_responsible && <CancelTask d={d} />}
      {!closed && (d.is_performer || d.is_responsible) && <CompleteTask d={d} />}
      {closed && d.is_responsible && <ReopenTask d={d} />}
    </>
  );
}

function CompleteTask({ d }: { d: TaskView }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const complete = useOp("completeTask", { silent: true, success: `“${d.task.title}” is done` });
  const id = `complete-${d.task.id}`;
  return (
    <>
      <button
        type="button"
        className={PRIMARY}
        disabled={d.blocking.length + d.unmet.length > 0}
        title={d.blocking.length + d.unmet.length > 0 ? "Clear the completion conditions first" : undefined}
        onClick={() => { complete.reset(); setOpen(true); }}
      >
        Complete
      </button>
      <Dialog isOpen={open} onClose={() => setOpen(false)} title="Complete task" style={{ width: "min(520px, calc(100vw - 32px))" }}>
        <DialogBody>
          <div className="space-y-3">
            <p className="text-sm">
              Mark <span className="font-medium">“{d.task.title}”</span> done. Tasks waiting for it may start.
            </p>
            <FormGroup label="Result note (optional)" labelFor={id} className="!mb-0">
              <TextArea id={id} fill rows={3} value={note} onChange={(e) => setNote(e.currentTarget.value)} placeholder="What was the result?" />
            </FormGroup>
            {complete.error && (
              <Callout intent="warning" role="alert" title="Not completed">
                {complete.error.message}
              </Callout>
            )}
          </div>
        </DialogBody>
        <DialogFooter
          actions={
            <>
              <Button variant="minimal" text="Keep open" onClick={() => setOpen(false)} />
              <Button
                intent="primary"
                text="Complete task"
                loading={complete.isPending}
                disabled={complete.isPending}
                onClick={() => complete.mutate({ task_id: d.task.id, result_note: note }, { onSuccess: () => { setOpen(false); setNote(""); } })}
              />
            </>
          }
        />
      </Dialog>
    </>
  );
}

function CancelTask({ d }: { d: TaskView }) {
  const [open, setOpen] = useState(false);
  const cancel = useOp("cancelTask", { silent: true, success: `“${d.task.title}” cancelled` });
  return (
    <>
      <button type="button" className={QUIET} onClick={() => { cancel.reset(); setOpen(true); }}>
        Cancel task
      </button>
      <Dialog isOpen={open} onClose={() => setOpen(false)} title="Cancel this task?" style={{ width: "min(520px, calc(100vw - 32px))" }}>
        <DialogBody>
          <div className="space-y-3 text-sm">
            <p>
              <span className="font-medium">“{d.task.title}”</span> will be cancelled.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-foreground/90">
              <li>Open requests about this task are withdrawn.</li>
              {d.assignment && <li>The agent assignment ({d.assignment.agent}) ends. Earlier actions aren&apos;t undone.</li>}
              <li>Shared documents and reviews are kept.</li>
            </ul>
            {cancel.error && (
              <Callout intent="danger" role="alert">
                {cancel.error.message}
              </Callout>
            )}
          </div>
        </DialogBody>
        <DialogFooter
          actions={
            <>
              <Button variant="minimal" text="Keep task" onClick={() => setOpen(false)} />
              <Button
                intent="danger"
                text="Cancel task"
                loading={cancel.isPending}
                disabled={cancel.isPending}
                onClick={() => cancel.mutate({ task_id: d.task.id }, { onSuccess: () => setOpen(false) })}
              />
            </>
          }
        />
      </Dialog>
    </>
  );
}

function ReopenTask({ d }: { d: TaskView }) {
  const reopen = useOp("reopenTask", { success: `“${d.task.title}” reopened` });
  return (
    <button
      type="button"
      className={SECONDARY}
      title="Reopening doesn't restart ended agents."
      disabled={reopen.isPending}
      onClick={() => reopen.mutate({ task_id: d.task.id })}
    >
      {reopen.isPending ? "Reopening…" : "Reopen"}
    </button>
  );
}
