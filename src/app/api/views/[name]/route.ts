import { NextResponse } from "next/server";
import { OpError, userCtx } from "@/server/context";
import { VIEWS, type ViewName } from "@/server/registry";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { name: string } }) {
  const name = params.name as ViewName;
  const fn = VIEWS[name];
  if (!fn) return NextResponse.json({ error: "Unknown view." }, { status: 404 });
  try {
    const ctx = await userCtx();
    const query = Object.fromEntries(new URL(req.url).searchParams.entries());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await (fn as any)(ctx, query);
    return NextResponse.json({ data });
  } catch (e) {
    if (e instanceof OpError) return NextResponse.json({ error: e.message, status: e.status }, { status: e.status });
    console.error(`[loura] view ${name} failed:`, e);
    return NextResponse.json({ error: "This couldn't be loaded. Try again." }, { status: 500 });
  }
}
