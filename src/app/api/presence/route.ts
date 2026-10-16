import { NextResponse } from "next/server";
import { ensureCookieLoginSession, getSessionPayload } from "@/modules/auth/getCurrentUser";

export const dynamic = "force-dynamic";

/** Lightweight presence heartbeat for logged-in cabinet users. */
export async function POST(): Promise<NextResponse> {
  const session = await getSessionPayload();
  if (!session) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    await ensureCookieLoginSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/presence failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
