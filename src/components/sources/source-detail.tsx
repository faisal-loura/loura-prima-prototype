"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Dialog, DialogBody, DialogFooter, FormGroup, TextArea } from "@blueprintjs/core";
import { useOp, type ViewData } from "@/lib/api";
import { EffectNote, KeyValue, Panel } from "@/components/ui/layout";
import { Avatar, fmtDateTime, Time } from "@/components/ui/content";
import { Pill, StatusTag } from "@/components/ui/status";
import { useShell } from "@/components/shell/shell-context";
import { CheckList, ConfirmButton, InlineError, humanize } from "@/components/ui/common";

type SourceData = ViewData<"source">;

export function SourceDetail({ d }: { d: SourceData }) {
  const s = d.source;
  const shell = useShell();
  const canManage = d.is_owner || Boolean(shell?.me.is_admin);
  const data = (s.data ?? {}) as Record<string, unknown>;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-4">
        <Panel title="Content" actions={canManage && s.kind === "document" ? <UpdateContent d={d} /> : undefined}>
          {s.kind === "record" && Object.keys(data).length > 0 && (
            <dl className="mb-4 grid grid-cols-[minmax(120px,auto)_1fr] gap-x-4 gap-y-1.5 rounded-md border p-3 text-sm">
              {Object.entries(data).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{humanize(k)}</dt>
                  <dd className="tabular">{String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
          {s.content ? (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{s.content}</pre>
          ) : (
            <p className="text-sm text-muted-foreground">No text content.</p>
          )}
          {s.kind === "record" && <p className="mt-3 text-xs text-muted-foreground">Record data comes from its export; it can&apos;t be edited here.</p>}
        </Panel>

        <Panel title="Used by" padded={false}>
          <div className="divide-y text-sm">
            <div className="px-4 py-3">
              <p className="mb-2 font-mono text-[11px] uppercase tracking-eyebrow text-muted-foreground">Assignments</p>
              {d.used_by_assignments.length ? (
                <ul className="space-y-1.5">
                  {d.used_by_assignments.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={`/assignments/${a.id}`} className="hover:underline">
                        {a.purpose}
                      </Link>
                      <StatusTag kind="assignment" value={a.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No assignments you can see rely on it.</p>
              )}
            </div>
          </div>
        </Panel>
      </div>

      <div className="min-w-0 space-y-4">
        <Panel title="Provenance">
          <KeyValue
            items={[
              { label: "Kind", value: s.kind === "record" ? "Record" : "Document" },
              { label: "Origin", value: s.origin },
              { label: "Version", value: `v${s.version}` },
              { label: "Observed", value: <span title={fmtDateTime(s.observed_at)}>{fmtDateTime(s.observed_at)}</span> },
              { label: "Updated", value: <Time iso={s.updated_at} /> },
              {
                label: "Owner",
                value: (
                  <span className="inline-flex items-center gap-1.5">
                    <Avatar name={d.owner} size={18} /> {d.owner}
                  </span>
                ),
              },
            ]}
          />
        </Panel>
        <AccessPanel d={d} canManage={canManage} />
      </div>
    </div>
  );
}

function AccessPanel({ d, canManage }: { d: SourceData; canManage: boolean }) {
  const s = d.source;
  const shell = useShell();
  const [ids, setIds] = useState<string[]>([]);
  const grant = useOp("grantSourceAccess", { success: (r) => `Gave ${r.granted} ${r.granted === 1 ? "person" : "people"} read access to “${s.title}”` });
  const revoke = useOp("revokeSourceAccess", { success: `Access to “${s.title}” removed` });

  const granted = d.grants.map((g) => g.user_id);
  const candidates = (shell?.members ?? []).filter((m) => m.status === "active" && m.user_id !== s.owner_id && !granted.includes(m.user_id));

  return (
    <Panel title="Access">
      <div className="space-y-3 text-sm">
        {s.restricted ? (
          <>
            <Pill tone="warn" icon="lock">
              Restricted
            </Pill>
            <p className="text-xs text-muted-foreground">Only the owner and the people below can read it.</p>
            {d.grants.length ? (
              <ul className="space-y-1.5">
                {d.grants.map((g) => (
                  <li key={g.user_id} className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5">
                      <Avatar name={g.name} size={18} /> {g.name}
                    </span>
                    {canManage && (
                      <ConfirmButton
                        text="Remove"
                        variant="minimal"
                        intent="danger"
                        title={`Remove ${g.name}'s access`}
                        body={<EffectNote>Further use and disclosure stop for {g.name}. Earlier history that used this source is kept.</EffectNote>}
                        onConfirm={() => revoke.mutateAsync({ source_id: s.id, user_id: g.user_id })}
                        error={revoke.error}
                      />
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Nobody else has access.</p>
            )}
            {canManage && (
              <div className="space-y-2 border-t pt-3">
                <CheckList label="Grant read access" options={candidates.map((m) => ({ value: m.user_id, label: m.full_name, detail: m.title }))} value={ids} onChange={setIds} empty="Everyone already has access." />
                <EffectNote>Grants reading only. It doesn&apos;t ask anyone to use it.</EffectNote>
                <InlineError error={grant.error} />
                <Button
                  size="small"
                  variant="outlined"
                  text="Grant access"
                  disabled={!ids.length}
                  loading={grant.isPending}
                  onClick={() => grant.mutate({ source_id: s.id, user_ids: ids }, { onSuccess: () => setIds([]) })}
                />
              </div>
            )}
          </>
        ) : (
          <p>Everyone in the organization can read this source.</p>
        )}
      </div>
    </Panel>
  );
}

function UpdateContent({ d }: { d: SourceData }) {
  const s = d.source;
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState(s.content);
  const update = useOp("updateSource", { silent: true, success: (r) => `“${s.title}” updated to version ${r.version}` });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await update.mutateAsync({ source_id: s.id, content }).catch(() => null);
    if (r) setOpen(false);
  }

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        icon="edit"
        text="Update content"
        onClick={() => {
          setContent(s.content);
          update.reset();
          setOpen(true);
        }}
      />
      <Dialog isOpen={open} onClose={() => setOpen(false)} title={`Update ${s.title}`} icon="edit" style={{ width: 640, maxWidth: "calc(100vw - 32px)" }}>
        <form onSubmit={submit}>
          <DialogBody className="space-y-3">
            <FormGroup label="Content" labelFor="src-update" className="!mb-0">
              <TextArea id="src-update" fill rows={12} value={content} onChange={(e) => setContent(e.currentTarget.value)} autoFocus />
            </FormGroup>
            <EffectNote>Creates version {s.version + 1}. Earlier results keep the version they used.</EffectNote>
            <InlineError error={update.error} />
          </DialogBody>
          <DialogFooter
            actions={
              <>
                <Button variant="minimal" text="Cancel" onClick={() => setOpen(false)} />
                <Button type="submit" intent="primary" text="Save new version" loading={update.isPending} disabled={content === s.content} />
              </>
            }
          />
        </form>
      </Dialog>
    </>
  );
}
