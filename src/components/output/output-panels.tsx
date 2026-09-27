"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Callout, Dialog, DialogBody, DialogFooter, Icon, TextArea } from "@blueprintjs/core";
import { useOp, type ViewData } from "@/lib/api";
import { EffectNote, Panel } from "@/components/ui/layout";
import { ActivityList, Avatar, Time } from "@/components/ui/content";
import { StatusTag } from "@/components/ui/status";

type OutputData = ViewData<"output">;
type Review = OutputData["reviews"][number];

export function ReviewPanel({ data }: { data: OutputData }) {
  return (
    <Panel title="Review">
      {data.reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">No review has been requested.</p>
      ) : (
        <ul className="space-y-4">
          {data.reviews.map((r) => (
            <ReviewItem key={r.id} review={r} currentVersion={data.current_version} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function reviewerState(rv: Review["reviewers"][number], version: number) {
  if (rv.request_status === "Withdrawn") return { label: "Request withdrawn", tone: "text-muted-foreground" };
  if (rv.request_status === "Superseded") return { label: "Request superseded", tone: "text-muted-foreground" };
  if (rv.decision === "accept") return { label: `Accepted version ${version}`, tone: "text-ready" };
  if (rv.decision === "request_changes") return { label: "Changes requested", tone: "text-blocked" };
  return { label: "Waiting", tone: "text-muted-foreground" };
}

function ReviewItem({ review, currentVersion }: { review: Review; currentVersion: number }) {
  const [confirm, setConfirm] = useState(false);
  const withdraw = useOp("withdrawReview", { success: `Review of version ${review.version} withdrawn`, silent: true });

  return (
    <li className="space-y-2 border-b pb-4 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Version {review.version}</span>
        <StatusTag kind="review" value={review.status} />
      </div>
      <p className="text-xs text-muted-foreground">
        Requested by {review.requested_by} · <Time iso={review.created_at} />
      </p>
      {review.note && <p className="text-sm">{review.note}</p>}
      {review.status === "Open" && review.version < currentVersion && (
        <p className="text-xs text-risk">Newer edits exist; this review concerns version {review.version}.</p>
      )}
      <ul className="space-y-1.5">
        {review.reviewers.map((rv) => {
          const st = reviewerState(rv, review.version);
          return (
            <li key={rv.user_id} className="flex items-start gap-2 text-sm">
              <Avatar name={rv.name} size={20} />
              <div className="min-w-0 flex-1">
                <p>
                  {rv.name}
                  {rv.is_me && <span className="text-muted-foreground"> (you)</span>} · <span className={st.tone}>{st.label}</span>
                </p>
                {rv.decision === "request_changes" && rv.text && <p className="mt-0.5 text-xs text-muted-foreground">“{rv.text}”</p>}
                {rv.is_me && rv.request_status === "Open" && rv.request_id && (
                  <Link href={`/inbox?request=${rv.request_id}`} className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium hover:underline">
                    Respond in Inbox <Icon icon="arrow-right" size={10} />
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {review.can_withdraw && (
        <Button size="small" variant="outlined" text="Withdraw review" onClick={() => setConfirm(true)} />
      )}
      <Dialog isOpen={confirm} onClose={() => setConfirm(false)} title={`Withdraw review of version ${review.version}?`} icon="undo">
        <DialogBody>
          <EffectNote>
            Unanswered review requests for version {review.version} close, and reviewers can no longer respond. A linked task returns to In
            progress, and its required review stays unmet. Decisions already given stay in history.
          </EffectNote>
          {withdraw.error && (
            <Callout intent="danger" compact className="mt-3" role="alert">
              {withdraw.error.message}
            </Callout>
          )}
        </DialogBody>
        <DialogFooter
          actions={
            <>
              <Button variant="minimal" text="Keep review open" onClick={() => setConfirm(false)} />
              <Button
                intent="danger"
                text="Withdraw review"
                loading={withdraw.isPending}
                onClick={async () => {
                  const r = await withdraw.mutateAsync({ submission_id: review.id }).catch(() => null);
                  if (r) setConfirm(false);
                }}
              />
            </>
          }
        />
      </Dialog>
    </li>
  );
}

export function SourcesPanel({ data }: { data: OutputData }) {
  const v = data.viewing;
  const sources = v?.sources ?? [];
  return (
    <Panel title="Sources">
      {sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sources are recorded for this version.</p>
      ) : (
        <ul className="space-y-2.5">
          {sources.map((s, i) => (
            <li key={`${s.source_id}-${i}`} className="text-sm">
              {!s.readable ? (
                <div className="flex items-start gap-2">
                  <Icon icon="lock" size={12} className="mt-1 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">Restricted source</p>
                    <p className="text-xs text-muted-foreground">You don&apos;t have access to this source.</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <Icon icon={s.kind === "connected_record" ? "data-connection" : "document"} size={12} className="mt-1 text-muted-foreground" />
                  <div className="min-w-0">
                    {s.kind === "connected_record" ? (
                      <p>{s.title}</p>
                    ) : (
                      <Link href={`/sources/${s.source_id}`} className="hover:underline">
                        {s.title}
                      </Link>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Version {s.version}
                      {s.observed_at && (
                        <>
                          {" "}
                          · observed <Time iso={s.observed_at} />
                        </>
                      )}
                    </p>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Sharing this document doesn&apos;t share its sources.</p>
    </Panel>
  );
}

export function CommentsPanel({ data }: { data: OutputData }) {
  const [body, setBody] = useState("");
  const add = useOp("addComment", { silent: true });
  return (
    <Panel title="Comments">
      {data.comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="space-y-3">
          {data.comments.map((c) => (
            <li key={c.id} className="flex gap-2 text-sm">
              <Avatar name={c.author} size={22} />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{c.author}</span> · on version {c.version} · <Time iso={c.created_at} />
                </p>
                <p className="whitespace-pre-wrap">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-4 space-y-2 border-t pt-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await add.mutateAsync({ output_id: data.output.id, body }).catch(() => null);
          if (r) setBody("");
        }}
      >
        <label htmlFor={`comment-${data.output.id}`} className="sr-only">
          Add a comment
        </label>
        <TextArea
          id={`comment-${data.output.id}`}
          fill
          rows={2}
          placeholder={`Comment on version ${data.current_version}`}
          value={body}
          onChange={(e) => setBody(e.currentTarget.value)}
        />
        {add.error && (
          <Callout intent="danger" compact role="alert">
            {add.error.message}
          </Callout>
        )}
        <div className="flex justify-end">
          <Button type="submit" size="small" text="Comment" disabled={!body.trim()} loading={add.isPending} />
        </div>
      </form>
    </Panel>
  );
}

export function TasksPanel({ data }: { data: OutputData }) {
  if (!data.tasks.length) return null;
  return (
    <Panel title="Linked tasks">
      <ul className="space-y-2">
        {data.tasks.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <Link href={`/tasks/${t.id}`} className="hover:underline">
              {t.title}
            </Link>
            <StatusTag kind="task" value={t.status} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function ActivityPanel({ data }: { data: OutputData }) {
  return (
    <Panel title="Activity">
      <ActivityList items={data.activity} />
    </Panel>
  );
}
