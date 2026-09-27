"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, DialogBody, DialogFooter, FormGroup, InputGroup, Switch, TextArea } from "@blueprintjs/core";
import { useOp, type ViewData } from "@/lib/api";
import { EffectNote, EmptyState, Panel } from "@/components/ui/layout";
import { fmtDateTime, RecordLink } from "@/components/ui/content";
import { Pill } from "@/components/ui/status";
import { DataTable, InlineError, Td } from "@/components/ui/common";

type Sources = ViewData<"sources">;

export function SourcesList({ d }: { d: Sources }) {
  return (
    <div className="space-y-4">
      <EffectNote>You only see sources you&apos;re permitted to read.</EffectNote>
      <Panel padded={false}>
        {d.sources.length ? (
          <DataTable head={["Source", "Kind", "Origin", "Version", "Observed", "Access", "Owner"]}>
            {d.sources.map((s) => (
              <tr key={s.id} className="hover:bg-muted/40">
                <Td className="min-w-[220px]">
                  <RecordLink href={`/sources/${s.id}`}>{s.title}</RecordLink>
                </Td>
                <Td className="whitespace-nowrap text-xs">{s.kind === "record" ? "Record" : "Document"}</Td>
                <Td className="min-w-[160px] text-xs text-muted-foreground">{s.origin}</Td>
                <Td className="tabular text-xs">v{s.version}</Td>
                <Td className="whitespace-nowrap text-xs text-muted-foreground">{fmtDateTime(s.observed_at)}</Td>
                <Td className="whitespace-nowrap">
                  {s.restricted ? (
                    <Pill tone="warn" icon="lock">
                      Restricted
                    </Pill>
                  ) : (
                    <Pill tone="muted">Organization</Pill>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-xs">{s.owner}</Td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState icon="document" title="No sources you can read" />
        )}
      </Panel>
    </div>
  );
}

export function AddSourceButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [restricted, setRestricted] = useState(false);
  const create = useOp("createSource", { silent: true, success: () => `Source “${title.trim()}” added` });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await create.mutateAsync({ title, content, restricted }).catch(() => null);
    if (r) router.push(`/sources/${r.source_id}`);
  }

  return (
    <>
      <Button intent="primary" icon="plus" text="Add source" onClick={() => setOpen(true)} />
      <Dialog isOpen={open} onClose={() => setOpen(false)} title="Add source" icon="document">
        <form onSubmit={submit}>
          <DialogBody className="space-y-3">
            <FormGroup label="Title" labelFor="src-title" className="!mb-0">
              <InputGroup id="src-title" value={title} onChange={(e) => setTitle(e.currentTarget.value)} autoFocus required />
            </FormGroup>
            <FormGroup label="Content" labelFor="src-content" helperText="Paste the document text." className="!mb-0">
              <TextArea id="src-content" fill rows={8} value={content} onChange={(e) => setContent(e.currentTarget.value)} />
            </FormGroup>
            <Switch
              checked={restricted}
              onChange={(e) => setRestricted(e.currentTarget.checked)}
              labelElement={<span>Restricted — only you and people you grant can read it</span>}
            />
            <EffectNote>
              {restricted
                ? "Nobody else can read it until you grant access. Adding it doesn't share it with anyone."
                : "Everyone in the organization can read it. Agents can use it when answering your colleagues."}
            </EffectNote>
            <InlineError error={create.error} />
          </DialogBody>
          <DialogFooter
            actions={
              <>
                <Button variant="minimal" text="Cancel" onClick={() => setOpen(false)} />
                <Button type="submit" intent="primary" text="Add source" loading={create.isPending} disabled={!title.trim() || !content.trim()} />
              </>
            }
          />
        </form>
      </Dialog>
    </>
  );
}
