"use client";

import { useState } from "react";
import { Button, Callout, Dialog, DialogBody, DialogFooter, FormGroup, InputGroup, TextArea } from "@blueprintjs/core";
import { useOp, type ViewData } from "@/lib/api";
import { useShell } from "@/components/shell/shell-context";
import { EffectNote, Eyebrow } from "@/components/ui/layout";
import { PersonSelect } from "@/components/ui/content";

type TaskView = ViewData<"task">;

export function AskInformationButton({ d }: { d: TaskView }) {
  const shell = useShell();
  const [open, setOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [question, setQuestion] = useState("");
  const [reason, setReason] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const people = shell?.members ?? [];
  const recipientName = people.find((p) => p.user_id === recipient)?.full_name;
  const create = useOp("createInformationRequest", {
    silent: true,
    success: () => `Request sent to ${recipientName ?? "them"}`,
  });
  const idp = `ask-${d.task.id}`;

  const submit = () =>
    create.mutate(
      { recipient_id: recipient, question, reason, context_excerpt: excerpt, task_id: d.task.id },
      {
        onSuccess: () => {
          setOpen(false);
          setRecipient("");
          setQuestion("");
          setReason("");
          setExcerpt("");
        },
      },
    );

  return (
    <>
      <Button variant="outlined" icon="help" text="Ask for information" onClick={() => setOpen(true)} />
      <Dialog isOpen={open} onClose={() => setOpen(false)} title="Ask for information" style={{ width: "min(640px, calc(100vw - 32px))" }}>
        <DialogBody>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              About the task <span className="text-foreground">“{d.task.title}”</span>.
            </p>
            <FormGroup label="Who do you want to ask?" labelFor={`${idp}-recipient`} className="!mb-0">
              <PersonSelect id={`${idp}-recipient`} people={people} value={recipient} onChange={setRecipient} exclude={shell ? [shell.me.user_id] : []} />
            </FormGroup>
            <FormGroup label="Question" labelFor={`${idp}-question`} className="!mb-0">
              <InputGroup id={`${idp}-question`} value={question} onChange={(e) => setQuestion(e.currentTarget.value)} placeholder="What do you need to know?" />
            </FormGroup>
            <FormGroup label="Why it's needed" labelFor={`${idp}-reason`} className="!mb-0">
              <TextArea id={`${idp}-reason`} fill rows={2} value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
            </FormGroup>
            <FormGroup label="Permitted context excerpt" labelFor={`${idp}-excerpt`} helperText="Only this text is shared with the request." className="!mb-0">
              <TextArea id={`${idp}-excerpt`} fill rows={3} value={excerpt} onChange={(e) => setExcerpt(e.currentTarget.value)} />
            </FormGroup>

            <div className="space-y-2 rounded-lg border bg-background p-3">
              <Eyebrow>What {recipientName ?? "the recipient"} will see</Eyebrow>
              <p className="text-sm font-medium">{question.trim() || <span className="font-normal text-muted-foreground">Your question</span>}</p>
              {reason.trim() && <p className="whitespace-pre-wrap text-sm text-foreground/90">{reason}</p>}
              {excerpt.trim() && (
                <blockquote className="whitespace-pre-wrap border-l-2 border-foreground/25 bg-muted/60 py-1.5 pl-3 text-sm">{excerpt}</blockquote>
              )}
              <p className="text-xs text-muted-foreground">Task: {d.task.title}</p>
            </div>
            <EffectNote>They&apos;ll see only this request and the excerpt, not the whole task.</EffectNote>
            {create.error && (
              <Callout intent="danger" compact role="alert">
                {create.error.message}
              </Callout>
            )}
          </div>
        </DialogBody>
        <DialogFooter
          actions={
            <>
              <Button variant="minimal" text="Cancel" onClick={() => setOpen(false)} />
              <Button intent="primary" text="Send request" disabled={!recipient || !question.trim() || create.isPending} loading={create.isPending} onClick={submit} />
            </>
          }
        />
      </Dialog>
    </>
  );
}
