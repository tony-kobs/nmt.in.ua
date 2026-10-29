import { NextResponse } from "next/server";
import { getTextbookImage } from "@/modules/textbook/imageStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteDeps = {
  load: typeof getTextbookImage;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ hash: string }> },
  deps: RouteDeps = { load: getTextbookImage },
): Promise<Response> {
  const { hash } = await context.params;
  let stored;
  try {
    stored = await deps.load(hash);
  } catch (error) {
    console.error("GET /api/textbook-media", error);
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
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
