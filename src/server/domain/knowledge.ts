import "server-only";
import { denied, OpError, type Ctx } from "../context";
import type { Source } from "../types";
import { assert, getOr404, log, nameOf, now } from "./common";

// ---------------------------------------------------------------------------
// Sources — permitted information with provenance. Linking never grants access.
// ---------------------------------------------------------------------------

export async function createSource(
  ctx: Ctx,
  args: { title: string; content: string; restricted: boolean; space_id?: string | null },
) {
  const title = args.title.trim();
  assert(title, new OpError("A source needs a title."));
  assert(args.content.trim(), new OpError("Paste or write the source content."));
  const { data, error } = await ctx.db
    .from("sources")
    .insert({
      org_id: ctx.me.org_id,
      title,
      kind: "document",
      origin: `Added by ${ctx.me.full_name}`,
      content: args.content,
      data: {},
      restricted: args.restricted,
      owner_id: ctx.me.user_id,
      space_id: args.space_id ?? null,
      observed_at: now(),
    })
    .select()
    .single();
  if (error) throw new OpError(error.message);
  await log(ctx, { verb: "added_source", summary: `Added source “${title}”${args.restricted ? " (restricted)" : ""}`, subject_kind: "source", subject_id: data.id });
  return { source_id: data.id as string };
}

/** A new version of a document source. Earlier results keep the version they used. */
export async function updateSource(ctx: Ctx, args: { source_id: string; content: string }) {
  const s = await getOr404<Source>(ctx, "sources", args.source_id, "This source");
  assert(s.owner_id === ctx.me.user_id || ctx.me.is_admin, denied("Only the source's owner can update it."));
  const { error } = await ctx.db
    .from("sources")
    .update({ content: args.content, version: s.version + 1, observed_at: now(), updated_at: now() })
    .eq("id", s.id);
  if (error) throw new OpError(error.message);
  await log(ctx, { verb: "updated_source", summary: `Updated “${s.title}” to version ${s.version + 1}. Earlier results keep version ${s.version}.`, subject_kind: "source", subject_id: s.id });
  return { version: s.version + 1 };
}

export async function grantSourceAccess(ctx: Ctx, args: { source_id: string; user_ids: string[] }) {
  const s = await getOr404<Source>(ctx, "sources", args.source_id, "This source");
  assert(s.owner_id === ctx.me.user_id || ctx.me.is_admin, denied("Only the source's owner can grant access to it."));
  assert(s.restricted, new OpError("This source isn't restricted; everyone in the organization can already read it."));
  const ids = args.user_ids.filter((u) => u !== s.owner_id);
  if (!ids.length) return { granted: 0 };
  const { error } = await ctx.db
    .from("source_grants")
    .upsert(ids.map((user_id) => ({ source_id: s.id, user_id, granted_by: ctx.me.user_id })));
  if (error) throw new OpError(`Access wasn't granted: ${error.message}`);
  const names = await Promise.all(ids.map((u) => nameOf(ctx, u)));
  await log(ctx, { verb: "granted_source", summary: `Gave ${names.join(", ")} read access to “${s.title}”`, subject_kind: "source", subject_id: s.id });
  return { granted: ids.length };
}

export async function revokeSourceAccess(ctx: Ctx, args: { source_id: string; user_id: string }) {
  const s = await getOr404<Source>(ctx, "sources", args.source_id, "This source");
  assert(s.owner_id === ctx.me.user_id || ctx.me.is_admin, denied("Only the source's owner can change its access."));
  await ctx.db.from("source_grants").delete().eq("source_id", s.id).eq("user_id", args.user_id);
  await log(ctx, {
    verb: "revoked_source",
    summary: `Removed ${await nameOf(ctx, args.user_id)}'s access to “${s.title}”. Further use and disclosure stop; earlier history is retained.`,
    subject_kind: "source",
    subject_id: s.id,
  });
  return { ok: true };
}
