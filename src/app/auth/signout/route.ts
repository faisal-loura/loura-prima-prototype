import { NextResponse } from "next/server";
import { userDb } from "@/server/db";

export async function POST(request: Request) {
  await userDb().auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
