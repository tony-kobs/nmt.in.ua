import { NextResponse } from "next/server";
import { getMarathonImageByToken } from "@/modules/marathons/daily/imageStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteDeps = {
  load: typeof getMarathonImageByToken;
};

/**
 * Public bytes for one marathon photo.
 * The intro image stays readable for a draft and for an active course that
 * has not started: the parking page uses this same `/api/marathon-media/<token>`
 * URL. A day photo is a different token and is not added to that page.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
  deps: RouteDeps = { load: getMarathonImageByToken },
): Promise<Response> {
  const { token } = await context.params;
  let stored;
  try {
    stored = await deps.load(token);
  } catch (error) {
    console.error("GET /api/marathon-media", error);
    return new NextResponse(null, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  if (!stored) {
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return new NextResponse(Buffer.from(stored.bytes), {
    status: 200,
    headers: {
      "Content-Type": stored.mime,
      "Content-Length": String(stored.bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
