"use client";

import { useState } from "react";
import { Button, Callout, Dialog, DialogBody, DialogFooter, FormGroup, HTMLSelect } from "@blueprintjs/core";
import { useOp, type ViewData } from "@/lib/api";
import { useShell } from "@/components/shell/shell-context";
import { EffectNote, Eyebrow } from "@/components/ui/layout";
import { Avatar, PersonSelect } from "@/components/ui/content";
import { Pill } from "@/components/ui/status";

type OutputData = ViewData<"output">;

export function ShareDialog({ data, isOpen, onClose }: { data: OutputData; isOpen: boolean; onClose: () => void }) {
  const shell = useShell();
  const [person, setPerson] = useState("");
  const [access, setAccess] = useState<"view" | "edit">("view");
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const share = useOp("shareOutput", { silent: true });
  const remove = useOp("removeGrant", { silent: true });

  const { audience } = data;
  const canManage = data.can_edit;
  const excluded = [...(audience.owner.user_id ? [audience.owner.user_id] : []), ...audience.grants.map((g) => g.user_id)];
  const people = (shell?.members ?? []).filter((m) => m.status === "active");
  const chosen = people.find((p) => p.user_id === person);
  const meId = shell?.me.user_id;
  const nameFor = (uid: string | null, name: string) => (uid === meId ? `${name} (you)` : name);

  async function submit() {
    if (!person) return;
    setResult(null);
    const r = await share.mutateAsync({ output_id: data.output.id, user_id: person, access }).catch(() => null);
    if (r) {
      setResult(r.message);
      setPerson("");
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/outputs/${data.output.id}`);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        setResult(null);
        setCopied("idle");
        onClose();
      }}
      title={`Share “${data.output.title}”`}
      icon="people"
      style={{ width: "min(94vw, 560px)" }}
    >
      <DialogBody>
        <div className="space-y-4">
          <section>
            <Eyebrow>Who can access it now</Eyebrow>
            <ul className="mt-2 divide-y rounded-lg border">
              <li className="flex items-center gap-2 px-3 py-2 text-sm">
                <Avatar name={audience.owner.name} />
                <span className="flex-1">{nameFor(audience.owner.user_id, audience.owner.name)}</span>
                <span className="text-xs text-muted-foreground">Owner</span>
              </li>
              {audience.grants.map((g) => (
                <li key={g.user_id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <Avatar name={g.name} />
                  <span className="flex-1">
                    {nameFor(g.user_id, g.name)}
                    {!g.active && <span className="ml-1 text-xs text-muted-foreground">(no longer active)</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">{g.access === "edit" ? "Can edit" : "Can view"}</span>
                  {canManage && (
                    <Button
                      size="small"
                      variant="minimal"
                      icon="cross"
                      aria-label={`Remove ${g.name}'s access`}
                      loading={remove.isPending && remove.variables?.user_id === g.user_id}
                      onClick={() => remove.mutate({ output_id: data.output.id, user_id: g.user_id })}
                    />
                  )}
                </li>
              ))}
            </ul>
            {remove.error && (
              <Callout intent="danger" compact className="mt-2">
                {remove.error.message}
              </Callout>
            )}
          </section>

          {canManage ? (
            <section className="space-y-3">
              <Eyebrow>Add a person</Eyebrow>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px]">
                <FormGroup label="Person" labelFor="share-person" className="!mb-0">
                  <PersonSelect id="share-person" people={people} value={person} onChange={setPerson} exclude={excluded} />
                </FormGroup>
                <FormGroup label="Permission" labelFor="share-access" className="!mb-0">
                  <HTMLSelect
                    id="share-access"
                    fill
                    value={access}
                    onChange={(e) => setAccess(e.currentTarget.value as "view" | "edit")}
                    options={[
                      { value: "view", label: "Can view" },
                      { value: "edit", label: "Can edit" },
                    ]}
                  />
                </FormGroup>
              </div>
              {chosen && (
                <div className="rounded-lg bg-muted px-3 py-2 text-xs">
                  <p className="mb-1 font-medium">Audience after change</p>
                  <ul className="space-y-0.5 text-muted-foreground">
                    <li>{audience.owner.name} — owner</li>
                    {audience.grants.map((g) => (
                      <li key={g.user_id}>
                        {g.name} — {g.access === "edit" ? "can edit" : "can view"}
                      </li>
                    ))}
                    <li className="text-foreground">
                      {chosen.full_name} — {access === "edit" ? "can view and edit" : "can view"} <Pill tone="progress">New</Pill>
                    </li>
                  </ul>
                </div>
              )}
              {result && (
                <Callout intent="success" compact icon="tick" role="status">
                  {result}
                </Callout>
              )}
              {share.error && (
                <Callout intent="danger" compact role="alert">
                  {share.error.message}
                </Callout>
              )}
              <EffectNote>Sharing doesn&apos;t assign work, request review, or share this document&apos;s sources or conversation.</EffectNote>
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">You can view this document. Only people who can edit it can change who has access.</p>
          )}

          <section className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Button variant="outlined" icon="link" text={copied === "copied" ? "Link copied" : "Copy link"} onClick={() => void copyLink()} />
            <span className="text-xs text-muted-foreground">
              {copied === "failed" ? "The link couldn't be copied. " : ""}A link doesn&apos;t grant access.
            </span>
          </section>
        </div>
      </DialogBody>
      <DialogFooter
        actions={
          <>
            <Button variant="minimal" text="Done" onClick={onClose} />
            {canManage && <Button intent="primary" text="Share" disabled={!person} loading={share.isPending} onClick={() => void submit()} />}
          </>
        }
      />
    </Dialog>
  );
}
