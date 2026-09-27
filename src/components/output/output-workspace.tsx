"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Callout, EditableText, Icon, Menu, MenuItem, Popover, Spinner, Tab, Tabs } from "@blueprintjs/core";
import { useOp, useView, type ViewData } from "@/lib/api";
import { useShell } from "@/components/shell/shell-context";
import { ErrorState, LoadingState } from "@/components/ui/layout";
import { Markdown, Time } from "@/components/ui/content";
import { Pill } from "@/components/ui/status";
import { cn } from "@/lib/utils";
import { DocumentEditor } from "./document-editor";
import { ProposalPanel } from "./proposal-panel";
import { ShareDialog } from "./share-dialog";
import { ActivityPanel, CommentsPanel, ReviewPanel, SourcesPanel, TasksPanel } from "./output-panels";
import { ReviseDialog, RequestReviewDialog, VersionsDrawer } from "./output-dialogs";

type OutputData = ViewData<"output">;
type DialogName = "share" | "versions" | "review" | "revise" | null;
type PanelTab = "document" | "review" | "sources" | "comments" | "activity";

export function audienceSummary(data: OutputData, meId?: string) {
  const { audience } = data;
  const n = audience.grants.length;
  const ownerIsMe = audience.owner.user_id === meId;
  if (n === 0) return ownerIsMe ? "Private — only you" : `Private — only ${audience.owner.name}`;
  const lead = ownerIsMe ? "You" : audience.owner.name;
  return `${lead} and ${n} ${n === 1 ? "person" : "people"}`;
}

/**
 * The document workspace: header, actions, editor (or read-only view), proposal
 * resolution, and Review / Sources / Comments / Activity. Used by the document page
 * and embedded next to a conversation.
 */
export function OutputWorkspace({ id, version, compact = false }: { id: string; version?: number; compact?: boolean }) {
  const router = useRouter();
  const shell = useShell();
  const q = useView("output", version ? { id, version: String(version) } : { id });
  const [dialog, setDialog] = useState<DialogName>(null);
  const [tab, setTab] = useState<PanelTab>("document");
  const [dirty, setDirty] = useState(false);
  const onDirtyChange = useCallback((d: boolean) => setDirty(d), []);
  const refetchContents = useCallback(async () => (await q.refetch()).data?.base_contents, [q]);

  // A version link that points at the current version opens the editable document.
  const loadedCurrent = q.data?.current_version;
  useEffect(() => {
    if (!compact && version !== undefined && loadedCurrent === version) router.replace(`/outputs/${id}`);
  }, [compact, version, loadedCurrent, id, router]);

  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;

  const viewingVersion = d.viewing?.version ?? d.current_version;
  const readOnlyOld = version !== undefined ? version !== d.current_version || viewingVersion !== d.current_version : false;
  const openProposal = d.proposals.find((p) => p.status === "Open");
  const revising = d.agent_working.filter((r) => r.trigger === "revise" || r.base_version !== null);
  const close = () => setDialog(null);

  const openVersion = (v: number) => {
    if (dirty && !window.confirm("Your latest changes haven't been saved yet. Open another version anyway?")) return;
    close();
    router.push(v === d.current_version ? `/outputs/${d.output.id}` : `/outputs/${d.output.id}?version=${v}`);
  };

  const header = (
    <Header
      data={d}
      compact={compact}
      meId={shell?.me.user_id}
      viewingVersion={viewingVersion}
      onOpen={setDialog}
    />
  );

  const documentColumn = (
    <div className="min-w-0 space-y-4">
      {revising.length > 0 && (
        <div role="status" className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
          <Spinner size={14} />
          <span>
            {revising[0].base_version !== null
              ? `The agent is revising from version ${revising[0].base_version}…`
              : "The agent is working on this document…"}
          </span>
        </div>
      )}

      {openProposal && !readOnlyOld && (
        <ProposalPanel data={d} proposal={openProposal} onRefresh={() => void q.refetch()} />
      )}

      {readOnlyOld ? (
        <div className="space-y-3">
          <Callout intent="primary" icon="history" compact>
            <span className="inline-flex flex-wrap items-center gap-2">
              You&apos;re viewing version {viewingVersion} (read-only). The current version is {d.current_version}.
              <Link href={`/outputs/${d.output.id}`} className="font-medium underline">
                Open current version
              </Link>
            </span>
          </Callout>
          <ReadOnlyDocument content={d.viewing?.content ?? ""} note={d.viewing?.note} author={d.viewing?.author} />
        </div>
      ) : d.can_edit ? (
        <div className="rounded-xl border bg-card p-3 sm:p-4">
          <DocumentEditor
            key={d.output.id}
            outputId={d.output.id}
            serverVersion={d.current_version}
            serverContent={d.base_contents[d.current_version] ?? d.viewing?.content ?? ""}
            versionContents={d.base_contents}
            loadedAt={d.viewing?.updated_at}
            onDirtyChange={onDirtyChange}
            onNeedRefresh={refetchContents}
            compact={compact}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">You can view this document.</p>
          <ReadOnlyDocument content={d.viewing?.content ?? ""} />
        </div>
      )}

      {!compact && <TasksPanel data={d} />}
    </div>
  );

  const dialogs = (
    <>
      <ShareDialog data={d} isOpen={dialog === "share"} onClose={close} />
      <VersionsDrawer data={d} isOpen={dialog === "versions"} onClose={close} viewingVersion={viewingVersion} onOpenVersion={openVersion} />
      {d.can_edit && <RequestReviewDialog data={d} isOpen={dialog === "review"} onClose={close} />}
      {d.can_edit && <ReviseDialog data={d} isOpen={dialog === "revise"} onClose={close} />}
    </>
  );

  if (compact) {
    return (
      <div className="space-y-4">
        {header}
        {documentColumn}
        <div className="rounded-xl border bg-card">
          <Tabs
            id={`doc-panels-${d.output.id}`}
            selectedTabId={tab === "document" ? "review" : tab}
            onChange={(t) => setTab(t as PanelTab)}
            className="px-4 pt-1"
          >
            <Tab id="review" title="Review" />
            <Tab id="sources" title="Sources" />
            <Tab id="comments" title="Comments" tagContent={d.comments.length || undefined} />
            <Tab id="activity" title="Activity" />
          </Tabs>
          <div className="[&>section]:rounded-none [&>section]:border-0 [&>section]:border-t">
            {(tab === "review" || tab === "document") && <ReviewPanel data={d} />}
            {tab === "sources" && <SourcesPanel data={d} />}
            {tab === "comments" && <CommentsPanel data={d} />}
            {tab === "activity" && <ActivityPanel data={d} />}
          </div>
        </div>
        <TasksPanel data={d} />
        {dialogs}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      {header}
      <div className="mb-4 lg:hidden">
        <Tabs id={`doc-tabs-${d.output.id}`} selectedTabId={tab} onChange={(t) => setTab(t as PanelTab)}>
          <Tab id="document" title="Document" />
          <Tab id="review" title="Review" />
          <Tab id="sources" title="Sources" />
          <Tab id="comments" title="Comments" tagContent={d.comments.length || undefined} />
          <Tab id="activity" title="Activity" />
        </Tabs>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className={cn(tab !== "document" && "hidden", "min-w-0 lg:block")}>{documentColumn}</div>
        <aside className="min-w-0 space-y-4">
          <div className={cn(tab !== "review" && "hidden", "lg:block")}>
            <ReviewPanel data={d} />
          </div>
          <div className={cn(tab !== "sources" && "hidden", "lg:block")}>
            <SourcesPanel data={d} />
          </div>
          <div className={cn(tab !== "comments" && "hidden", "lg:block")}>
            <CommentsPanel data={d} />
          </div>
          <div className={cn(tab !== "activity" && "hidden", "lg:block")}>
            <ActivityPanel data={d} />
          </div>
        </aside>
      </div>
      {dialogs}
    </div>
  );
}

function Header({
  data,
  compact,
  meId,
  viewingVersion,
  onOpen,
}: {
  data: OutputData;
  compact: boolean;
  meId?: string;
  viewingVersion: number;
  onOpen: (d: DialogName) => void;
}) {
  const rename = useOp("renameOutput", { silent: true });
  const [title, setTitle] = useState(data.output.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const shownTitle = editingTitle ? title : data.output.title;

  const more = (
    <Menu>
      {data.can_edit && <MenuItem icon="endorsed" text="Request review" onClick={() => onOpen("review")} />}
      <MenuItem icon="history" text="Versions" onClick={() => onOpen("versions")} />
    </Menu>
  );

  return (
    <header className={cn("space-y-2", compact ? "" : "mb-6")}>
      {!compact && (
        <Link href="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <Icon icon="chevron-left" size={12} /> Home
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="font-mono text-[11px] font-medium uppercase tracking-eyebrow text-muted-foreground">Document</p>
          <h1 className={cn("font-normal leading-tight tracking-tight", compact ? "text-lg" : "text-2xl")}>
            {data.can_edit ? (
              <EditableText
                value={shownTitle}
                onEdit={() => {
                  setTitle(data.output.title);
                  setEditingTitle(true);
                }}
                onChange={setTitle}
                onCancel={() => setEditingTitle(false)}
                onConfirm={async (v) => {
                  setEditingTitle(false);
                  const next = v.trim();
                  if (next && next !== data.output.title) {
                    await rename.mutateAsync({ output_id: data.output.id, title: next }).catch(() => null);
                  }
                }}
                placeholder="Untitled document"
                selectAllOnFocus
              />
            ) : (
              data.output.title
            )}
          </h1>
          {rename.error && <p className="text-xs text-blocked">The title wasn&apos;t changed: {rename.error.message}</p>}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>Owner: {data.owner}</span>
            <span aria-hidden>·</span>
            <span>Version {data.current_version}</span>
            {viewingVersion !== data.current_version && <Pill tone="neutral">Viewing version {viewingVersion}</Pill>}
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <Icon icon={data.audience.grants.length ? "people" : "lock"} size={11} />
              {audienceSummary(data, meId)}
            </span>
            <span aria-hidden>·</span>
            <span>
              Updated <Time iso={data.output.updated_at} />
            </span>
            {compact && (
              <>
                <span aria-hidden>·</span>
                <Link href={`/outputs/${data.output.id}`} className="inline-flex items-center gap-1 hover:underline">
                  Open full page <Icon icon="share" size={10} />
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button intent="primary" icon="people" text="Share" onClick={() => onOpen("share")} />
          {data.can_edit && <Button variant="outlined" icon="predictive-analysis" text="Ask agent to revise" onClick={() => onOpen("revise")} />}
          {compact ? (
            <Popover content={more} placement="bottom-end">
              <Button variant="outlined" icon="more" aria-label="More document actions" />
            </Popover>
          ) : (
            <>
              <Button variant="outlined" icon="history" text="Versions" onClick={() => onOpen("versions")} />
              {data.can_edit && <Button variant="outlined" icon="endorsed" text="Request review" onClick={() => onOpen("review")} />}
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function ReadOnlyDocument({ content, note, author }: { content: string; note?: string; author?: string }) {
  return (
    <article className="rounded-xl border bg-card p-5 sm:p-6">
      {(author || note) && (
        <p className="mb-4 border-b pb-3 text-xs text-muted-foreground">
          {author && <>By {author}</>}
          {author && note && " · "}
          {note}
        </p>
      )}
      {content.trim() ? <Markdown>{content}</Markdown> : <p className="text-sm text-muted-foreground">This version is empty.</p>}
    </article>
  );
}
