import { NextResponse, type NextRequest } from "next/server";
import { getStoredAvatar } from "@/modules/auth/avatar/store";

const USER_ID_PATTERN = /^[1-9][0-9]{0,9}$/;

type RouteDeps = {
  getStoredAvatar: typeof getStoredAvatar;
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
  deps: RouteDeps = { getStoredAvatar },
) {
  const { userId: raw } = await context.params;
  if (!USER_ID_PATTERN.test(raw)) {
    return new NextResponse(null, { status: 404 });
  }
  const userId = Number(raw);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return new NextResponse(null, { status: 404 });
  }

  let stored;
  try {
    stored = await deps.getStoredAvatar(userId);
  } catch (error) {
    console.error("GET /api/avatar: unexpected error", error);
    return new NextResponse(null, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (!stored) {
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const versioned = request.nextUrl.searchParams.has("v");
  return new NextResponse(Buffer.from(stored.bytes), {
    status: 200,
    headers: {
      "Content-Type": stored.mime,
      "Content-Length": String(stored.bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": versioned
        ? "public, max-age=31536000, immutable"
        : "public, max-age=60",
    },
  });
}
