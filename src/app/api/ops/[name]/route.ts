import { NextResponse } from "next/server";
import { OpError, userCtx } from "@/server/context";
import { OPS, type OpName } from "@/server/registry";
import "@/server/worker";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { name: string } }) {
  const name = params.name as OpName;
  const fn = OPS[name];
  if (!fn) return NextResponse.json({ error: "Unknown operation." }, { status: 404 });
  try {
    const ctx = await userCtx();
    const args = await req.json().catch(() => ({}));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (fn as any)(ctx, args);
    return NextResponse.json({ data: result ?? null });
  } catch (e) {
    if (e instanceof OpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(`[loura] op ${name} failed:`, e);
    return NextResponse.json({ error: "Something went wrong. Nothing further was changed; try again." }, { status: 500 });
  }
}
