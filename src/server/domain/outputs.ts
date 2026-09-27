import "server-only";
import { conflict, denied, OpError, type Ctx } from "../context";
import { kick } from "../kick";
import type { Output, OutputGrant, OutputProposal, OutputVersion, ReviewSubmission, Task } from "../types";
import { assert, getOr404, log, nameOf, notify, now, truncate } from "./common";

/** Edits by the same person within this window update the same unlocked version. */
const COALESCE_MS = 30 * 60 * 1000;

async function canEdit(ctx: Ctx, outputId: string): Promise<boolean> {
  const { data, error } = await ctx.db.rpc("can_edit_output", { oid: outputId });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function currentVersion(ctx: Ctx, output: Output): Promise<OutputVersion> {
  const { data } = await ctx.db
    .from("output_versions")
    .select("*")
    .eq("output_id", output.id)
    .eq("version", output.current_version)
    .single();
  return data as OutputVersion;
}

export async function createOutput(
  ctx: Ctx,
  args: { title: string; content?: string; private?: boolean },
) {
  const title = args.title.trim() || "Untitled document";
  const { data: output, error } = await ctx.db
    .from("outputs")
    .insert({
      org_id: ctx.me.org_id,
      title,
      owner_id: ctx.me.user_id,
      private: args.private ?? false,
      current_version: 1,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const v = await ctx.db.from("output_versions").insert({
    output_id: output.id,
    version: 1,
    content: args.content ?? "",
    author_kind: "person",
    author_id: ctx.me.user_id,
    note: "Created",
  });
  if (v.error) throw new Error(v.error.message);

  await log(ctx, {
    verb: "created",
    summary: `Created document “${title}”`,
    subject_kind: "output",
    subject_id: output.id,
  });
  return { output_id: output.id as string };
}

export async function renameOutput(ctx: Ctx, args: { output_id: string; title: string }) {
  const output = await getOr404<Output>(ctx, "outputs", args.output_id, "This document");
  assert(await canEdit(ctx, output.id), denied("You can view this document but not edit it."));
  const title = args.title.trim();
  assert(title, new OpError("A document needs a title."));
  await ctx.db.from("outputs").update({ title, updated_at: now() }).eq("id", output.id);
  return { ok: true };
}

/**
 * Autosave. `base_version` is the version the editor started from; if someone
 * (a colleague, or an applied agent revision) saved a newer version meanwhile,
 * nothing is overwritten and the person's text stays in their editor.
 */
export async function saveOutput(ctx: Ctx, args: { output_id: string; content: string; base_version: number }) {
  const output = await getOr404<Output>(ctx, "outputs", args.output_id, "This document");
  assert(await canEdit(ctx, output.id), denied("You can view this document but not edit it."));

  if (output.current_version !== args.base_version) {
    const latest = await currentVersion(ctx, output);
    const who = latest.author_kind === "agent" ? "an agent revision" : await nameOf(ctx, latest.author_id);
    return {
      status: "conflict" as const,
      current_version: output.current_version,
      message: `Version ${output.current_version} was saved by ${who} while you were editing. Your text is still here — compare before saving.`,
    };
  }

  const latest = await currentVersion(ctx, output);
  const { count: openProposals } = await ctx.db
    .from("output_proposals")
    .select("id", { count: "exact", head: true })
    .eq("output_id", output.id)
    .eq("based_on", latest.version)
    .eq("status", "Open");

  const coalesce =
    !latest.locked &&
    latest.author_kind === "person" &&
    latest.author_id === ctx.me.user_id &&
    !openProposals &&
    Date.now() - new Date(latest.created_at).getTime() < COALESCE_MS;

  if (coalesce) {
    if (latest.content === args.content) return { status: "saved" as const, version: latest.version, saved_at: latest.updated_at };
    const { error } = await ctx.db
      .from("output_versions")
      .update({ content: args.content, updated_at: now() })
      .eq("id", latest.id)
      .eq("locked", false);
    if (error) throw new Error(error.message);
    await ctx.db.from("outputs").update({ updated_at: now() }).eq("id", output.id);
    return { status: "saved" as const, version: latest.version, saved_at: now() };
  }

  if (latest.content === args.content) return { status: "saved" as const, version: latest.version, saved_at: latest.updated_at };

  const next = output.current_version + 1;
  // Compare-and-set on the version counter: a concurrent save loses cleanly.
  const bump = await ctx.db
    .from("outputs")
    .update({ current_version: next, updated_at: now() })
    .eq("id", output.id)
    .eq("current_version", output.current_version)
    .select("id");
  if (bump.error) throw new Error(bump.error.message);
  if (!bump.data?.length) {
    return {
      status: "conflict" as const,
      current_version: output.current_version + 1,
      message: "Someone saved a newer version at the same moment. Your text is still here — compare before saving.",
    };
  }
  const ins = await ctx.db.from("output_versions").insert({
    output_id: output.id,
    version: next,
    content: args.content,
    author_kind: "person",
    author_id: ctx.me.user_id,
    based_on: output.current_version,
    sources: latest.sources ?? [],
    note: latest.locked ? `Edited after version ${latest.version} was locked for review or agent use` : "Edited",
  });
  if (ins.error) throw new Error(ins.error.message);
  await log(ctx, {
    verb: "edited",
    summary: `Saved version ${next} of “${output.title}”`,
    subject_kind: "output",
    subject_id: output.id,
    mission_id: output.mission_id,
  });
  return { status: "saved" as const, version: next, saved_at: now() };
}

// ---------------------------------------------------------------------------
// Sharing — changes the audience. It never assigns work or requests review.
// ---------------------------------------------------------------------------

export async function shareOutput(ctx: Ctx, args: { output_id: string; user_id: string; access: "view" | "edit" }) {
  const output = await getOr404<Output>(ctx, "outputs", args.output_id, "This document");
  assert(await canEdit(ctx, output.id), denied("Only people who can edit this document can share it."));
  assert(args.user_id !== output.owner_id, new OpError("That person already owns this document."));

  const { data: recipient } = await ctx.db.from("members").select("*").eq("user_id", args.user_id).maybeSingle();
  assert(recipient && recipient.status === "active", new OpError("That person isn't an active member of this organization."));

  const { data: existing } = await ctx.db
    .from("output_grants")
    .select("*")
    .eq("output_id", output.id)
    .eq("user_id", args.user_id)
    .maybeSingle();
  if (existing && (existing as OutputGrant).access === args.access) {
    return { status: "unchanged" as const, message: `${recipient.full_name} already has ${args.access} access.` };
  }

  const { error } = await ctx.db
    .from("output_grants")
    .upsert({ output_id: output.id, user_id: args.user_id, access: args.access, granted_by: ctx.me.user_id });
  if (error) throw new OpError(`Access wasn't changed: ${error.message}`);

  // Report success only once the grant is actually in effect.
  const { data: check } = await ctx.db
    .from("output_grants")
    .select("access")
    .eq("output_id", output.id)
    .eq("user_id", args.user_id)
    .maybeSingle();
  assert(check?.access === args.access, new OpError("Access couldn't be confirmed. Nothing was shared."));

  await notify(ctx, args.user_id, {
    kind: "shared",
    title: `${ctx.me.full_name} shared “${output.title}” with you`,
    body: `You can ${args.access === "edit" ? "view and edit" : "view"} it. This isn't a request for action.`,
    link: `/outputs/${output.id}`,
  });
  await log(ctx, {
    verb: "shared",
    summary: `Gave ${recipient.full_name} ${args.access} access to “${output.title}”`,
    subject_kind: "output",
    subject_id: output.id,
    mission_id: output.mission_id,
  });
  return { status: "granted" as const, message: `${recipient.full_name} can now ${args.access} this document.` };
}

export async function removeGrant(ctx: Ctx, args: { output_id: string; user_id: string }) {
  const output = await getOr404<Output>(ctx, "outputs", args.output_id, "This document");
  assert(await canEdit(ctx, output.id), denied("Only people who can edit this document can change its access."));
  const { error } = await ctx.db.from("output_grants").delete().eq("output_id", output.id).eq("user_id", args.user_id);
  if (error) throw new OpError(error.message);
  const name = await nameOf(ctx, args.user_id);
  await log(ctx, {
    verb: "unshared",
    summary: `Removed ${name}'s access to “${output.title}”`,
    subject_kind: "output",
    subject_id: output.id,
    mission_id: output.mission_id,
  });
  return { ok: true };
}

export async function addComment(ctx: Ctx, args: { output_id: string; body: string }) {
  const output = await getOr404<Output>(ctx, "outputs", args.output_id, "This document");
  const body = args.body.trim();
  assert(body, new OpError("A comment can't be empty."));
  const { error } = await ctx.db.from("output_comments").insert({
    output_id: output.id,
    version: output.current_version,
    author_id: ctx.me.user_id,
    body,
  });
  if (error) throw new OpError(error.message);
  await notify(ctx, output.owner_id, {
    kind: "comment",
    title: `${ctx.me.full_name} commented on “${output.title}”`,
    body: truncate(body, 140),
    link: `/outputs/${output.id}`,
  });
  await log(ctx, {
    verb: "commented",
    summary: `Commented on version ${output.current_version} of “${output.title}”`,
    subject_kind: "output",
    subject_id: output.id,
    mission_id: output.mission_id,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Review — concerns one saved version and a fixed set of required reviewers.
// ---------------------------------------------------------------------------

export async function requestReview(
  ctx: Ctx,
  args: { output_id: string; version: number; reviewer_ids: string[]; note?: string },
) {
  const output = await getOr404<Output>(ctx, "outputs", args.output_id, "This document");
  assert(await canEdit(ctx, output.id), denied("Only people who can edit this document can request its review."));
  assert(args.reviewer_ids.length > 0, new OpError("Choose at least one required reviewer."));
  const { data: version } = await ctx.db
    .from("output_versions")
    .select("*")
    .eq("output_id", output.id)
    .eq("version", args.version)
    .maybeSingle();
  assert(version, new OpError(`Version ${args.version} doesn't exist.`));

  // Reviewers must be able to see the version they're asked to review.
  // Submission itself never widens the audience.
  for (const rid of args.reviewer_ids) {
    const { data: m } = await ctx.db.from("members").select("full_name,status").eq("user_id", rid).maybeSingle();
    assert(m && m.status === "active", new OpError("A selected reviewer isn't an active member."));
    const visible = await reviewerCanSee(ctx, output, rid);
    assert(
      visible,
      new OpError(`${m.full_name} can't see this document yet. Share it first — requesting review doesn't grant access.`),
    );
  }

  await ctx.db.from("output_versions").update({ locked: true }).eq("id", version.id);

  const { data: sub, error } = await ctx.db
    .from("review_submissions")
    .insert({
      output_id: output.id,
      version: args.version,
      reviewer_ids: args.reviewer_ids,
      requested_by: ctx.me.user_id,
      note: args.note ?? "",
    })
    .select()
    .single();
  if (error) throw new OpError(error.message);

  // A task that delivers this output and needs review waits on this submission.
  const { data: tasks } = await ctx.db
    .from("tasks")
    .select("*")
    .eq("output_id", output.id)
    .eq("requires_review", true)
    .in("status", ["Open", "InProgress"]);

  const task = (tasks as Task[] | null)?.[0] ?? null;
  for (const t of (tasks ?? []) as Task[]) {
    await ctx.db
      .from("tasks")
      .update({ status: "InReview", review_submission_id: sub.id, review_satisfied: false, updated_at: now() })
      .eq("id", t.id);
    await log(ctx, {
      verb: "submitted",
      summary: `“${t.title}” is in review (version ${args.version})`,
      subject_kind: "task",
      subject_id: t.id,
      mission_id: t.mission_id,
    });
  }

  for (const rid of args.reviewer_ids) {
    await ctx.db.from("requests").insert({
      org_id: ctx.me.org_id,
      type: "review",
      recipient_id: rid,
      requester_kind: "person",
      requester_id: ctx.me.user_id,
      question: `Review “${output.title}” · Version ${args.version}`,
      reason: args.note?.trim() || "A decision is needed on this version before it can be used.",
      mission_id: output.mission_id,
      task_id: task?.id ?? null,
      output_id: output.id,
      output_version: args.version,
      review_submission_id: sub.id,
    });
    await notify(ctx, rid, {
      kind: "review_requested",
      title: `${ctx.me.full_name} requested your review`,
      body: `“${output.title}” · Version ${args.version}`,
      link: "/inbox",
    });
  }

  await log(ctx, {
    verb: "requested_review",
    summary: `Requested review of “${output.title}” version ${args.version}`,
    subject_kind: "output",
    subject_id: output.id,
    mission_id: output.mission_id,
    data: { submission_id: sub.id, reviewers: args.reviewer_ids },
  });
  return { submission_id: sub.id as string };
}

async function reviewerCanSee(ctx: Ctx, output: Output, userId: string) {
  if (output.owner_id === userId) return true;
  const { data: g } = await ctx.db
    .from("output_grants")
    .select("user_id")
    .eq("output_id", output.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (g) return true;
  return false;
}

export async function withdrawReview(ctx: Ctx, args: { submission_id: string }) {
  const sub = await getOr404<ReviewSubmission>(ctx, "review_submissions", args.submission_id, "This review");
  const output = await getOr404<Output>(ctx, "outputs", sub.output_id, "This document");
  assert(
    sub.requested_by === ctx.me.user_id || output.owner_id === ctx.me.user_id,
    denied("Only the person who requested this review, or the document's owner, can withdraw it."),
  );
  const upd = await ctx.db
    .from("review_submissions")
    .update({ status: "Withdrawn", closed_at: now() })
    .eq("id", sub.id)
    .eq("status", "Open")
    .select("id");
  assert(upd.data?.length, conflict("This review is no longer open."));

  await ctx.db
    .from("requests")
    .update({ status: "Withdrawn", updated_at: now() })
    .eq("review_submission_id", sub.id)
    .eq("status", "Open");

  const { data: tasks } = await ctx.db
    .from("tasks")
    .select("*")
    .eq("review_submission_id", sub.id)
    .eq("status", "InReview");
  for (const t of (tasks ?? []) as Task[]) {
    await ctx.db.from("tasks").update({ status: "InProgress", review_satisfied: false, updated_at: now() }).eq("id", t.id);
  }
  await log(ctx, {
    verb: "withdrew_review",
    summary: `Withdrew the review of “${output.title}” version ${sub.version}. Required review is still unmet.`,
    subject_kind: "output",
    subject_id: output.id,
    mission_id: output.mission_id,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Agent revisions and conflicting edits
// ---------------------------------------------------------------------------

/** Ask the agent that serves this document to revise it. Its result never silently replaces newer human edits. */
export async function askAgentToRevise(ctx: Ctx, args: { output_id: string; instruction: string; agent_id?: string }) {
  const output = await getOr404<Output>(ctx, "outputs", args.output_id, "This document");
  assert(await canEdit(ctx, output.id), denied("Only people who can edit this document can ask for a revision."));
  const instruction = args.instruction.trim();
  assert(instruction, new OpError("Describe the revision you want."));

  // Prefer the assignment that produced this document; otherwise start a contribution.
  const { data: existing } = await ctx.db
    .from("assignments")
    .select("*")
    .eq("output_id", output.id)
    .eq("kind", "contribution")
    .order("created_at", { ascending: false })
    .limit(1);
  let assignment = existing?.[0] as { id: string; agent_id: string; status: string } | undefined;

  if (!assignment || assignment.status === "Ended") {
    const agentId = args.agent_id ?? assignment?.agent_id ?? (await defaultAgentId(ctx, "Drafting agent"));
    const { data: agent } = await ctx.db.from("agents").select("*").eq("id", agentId).single();
    assert(agent?.published_revision_id, new OpError("That agent has no published revision available."));
    const ins = await ctx.db
      .from("assignments")
      .insert({
        org_id: ctx.me.org_id,
        agent_id: agent.id,
        agent_revision_id: agent.published_revision_id,
        kind: "contribution",
        purpose: `Revise “${output.title}”`,
        instructions: instruction,
        status: "Active",
        responsible_id: ctx.me.user_id,
        created_by: ctx.me.user_id,
        mission_id: output.mission_id,
        output_id: output.id,
      })
      .select()
      .single();
    if (ins.error) throw new OpError(ins.error.message);
    assignment = ins.data;
  } else if (assignment.status !== "Active") {
    throw new OpError(`The agent's assignment for this document is ${assignment.status.toLowerCase()}. Resume it first.`);
  }

  // The agent works from the current version; lock it so later edits create a new version.
  await ctx.db
    .from("output_versions")
    .update({ locked: true })
    .eq("output_id", output.id)
    .eq("version", output.current_version);

  const run = await ctx.db
    .from("runs")
    .insert({
      org_id: ctx.me.org_id,
      assignment_id: assignment!.id,
      trigger: "revise",
      instruction,
      inputs: { output_id: output.id, base_version: output.current_version },
      created_by: ctx.me.user_id,
    })
    .select()
    .single();
  if (run.error) throw new OpError(run.error.message);
  await log(ctx, {
    verb: "instructed",
    summary: `Asked the agent to revise “${output.title}” from version ${output.current_version}: ${truncate(instruction, 100)}`,
    subject_kind: "output",
    subject_id: output.id,
    mission_id: output.mission_id,
    assignment_id: assignment!.id,
  });
  kick();
  return { run_id: run.data.id as string };
}

export async function defaultAgentId(ctx: Ctx, name: string): Promise<string> {
  const { data } = await ctx.db.from("agents").select("id").eq("name", name).maybeSingle();
  if (!data) throw new OpError(`No agent named “${name}” is available.`);
  return data.id as string;
}

export async function applyProposal(ctx: Ctx, args: { proposal_id: string; expected_current_version: number }) {
  const p = await getOr404<OutputProposal>(ctx, "output_proposals", args.proposal_id, "This proposed revision");
  const output = await getOr404<Output>(ctx, "outputs", p.output_id, "This document");
  assert(await canEdit(ctx, output.id), denied("You can't edit this document."));
  assert(p.status === "Open", conflict("This proposed revision has already been resolved."));
  // Recheck the base: if the document moved again, refresh rather than overwrite.
  assert(
    output.current_version === args.expected_current_version,
    conflict(`The document changed again (now version ${output.current_version}). Refresh the comparison before applying.`),
  );
  return writeResolvedVersion(ctx, output, p, p.content, "Applied the agent's proposed revision");
}

export async function applyCombined(
  ctx: Ctx,
  args: { proposal_id: string; content: string; expected_current_version: number },
) {
  const p = await getOr404<OutputProposal>(ctx, "output_proposals", args.proposal_id, "This proposed revision");
  const output = await getOr404<Output>(ctx, "outputs", p.output_id, "This document");
  assert(await canEdit(ctx, output.id), denied("You can't edit this document."));
  assert(p.status === "Open", conflict("This proposed revision has already been resolved."));
  assert(
    output.current_version === args.expected_current_version,
    conflict(`The document changed again (now version ${output.current_version}). Refresh the comparison before saving.`),
  );
  return writeResolvedVersion(ctx, output, p, args.content, "Saved a combined version from the agent's proposal", true);
}

async function writeResolvedVersion(
  ctx: Ctx,
  output: Output,
  p: OutputProposal,
  content: string,
  summary: string,
  byPerson = false,
) {
  const next = output.current_version + 1;
  const bump = await ctx.db
    .from("outputs")
    .update({ current_version: next, updated_at: now() })
    .eq("id", output.id)
    .eq("current_version", output.current_version)
    .select("id");
  assert(bump.data?.length, conflict("The document changed at the same moment. Refresh the comparison."));
  const prev = await currentVersion(ctx, { ...output, current_version: output.current_version });
  await ctx.db.from("output_versions").insert({
    output_id: output.id,
    version: next,
    content,
    author_kind: byPerson ? "person" : "agent",
    author_id: ctx.me.user_id,
    agent_id: byPerson ? null : p.agent_id,
    run_id: p.run_id,
    based_on: output.current_version,
    sources: prev?.sources ?? [],
    note: byPerson
      ? `Combined by ${ctx.me.full_name} from an agent proposal based on version ${p.based_on}`
      : `Agent proposal based on version ${p.based_on}, applied by ${ctx.me.full_name}`,
  });
  await ctx.db
    .from("output_proposals")
    .update({ status: "Applied", applied_version: next, resolved_by: ctx.me.user_id, resolved_at: now() })
    .eq("id", p.id);
  await log(ctx, {
    verb: "resolved_conflict",
    summary: `${summary} to “${output.title}” as version ${next}`,
    subject_kind: "output",
    subject_id: output.id,
    mission_id: output.mission_id,
  });
  return { version: next };
}

export async function keepCurrentVersion(ctx: Ctx, args: { proposal_id: string }) {
  const p = await getOr404<OutputProposal>(ctx, "output_proposals", args.proposal_id, "This proposed revision");
  const output = await getOr404<Output>(ctx, "outputs", p.output_id, "This document");
  assert(await canEdit(ctx, output.id), denied("You can't edit this document."));
  const upd = await ctx.db
    .from("output_proposals")
    .update({ status: "Kept", resolved_by: ctx.me.user_id, resolved_at: now() })
    .eq("id", p.id)
    .eq("status", "Open")
    .select("id");
  assert(upd.data?.length, conflict("This proposed revision has already been resolved."));
  await log(ctx, {
    verb: "resolved_conflict",
    summary: `Kept the current version of “${output.title}”. The agent's proposal stays in history.`,
    subject_kind: "output",
    subject_id: output.id,
    mission_id: output.mission_id,
  });
  return { ok: true };
}
