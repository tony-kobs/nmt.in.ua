import { NextResponse, type NextRequest } from "next/server";
import { optionalLiveUser } from "@/modules/auth/getCurrentUser";
import { parseBankTaskRef } from "@/modules/textbook/bankTask";
import { loadBankTaskViews, searchBankTasks } from "@/modules/textbook/bankTaskStore";
import { textbookUploadAllowed } from "@/modules/textbook/uploadRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REF_LIMIT = 80;

type AdminGate = { ok: true } | { ok: false; status: 401 | 403 };

type RouteDeps = {
  requireAdmin: () => Promise<AdminGate>;
  search: typeof searchBankTasks;
  load: typeof loadBankTaskViews;
};

async function requireAdmin(): Promise<AdminGate> {
  const user = await optionalLiveUser();
  if (!user) return { ok: false, status: 401 };
  if (user.role !== "admin") return { ok: false, status: 403 };
  return { ok: true };
}

function allowed(request: NextRequest): boolean {
  return textbookUploadAllowed({
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    secFetchSite: request.headers.get("sec-fetch-site"),
  });
}

export async function GET(
  request: NextRequest,
  _context?: unknown,
  deps: RouteDeps = { requireAdmin, search: searchBankTasks, load: loadBankTaskViews },
): Promise<NextResponse> {
  if (!allowed(request)) return NextResponse.json({ ok: false, error: "origin" }, { status: 403 });
  const admin = await deps.requireAdmin();
  if (!admin.ok) return NextResponse.json({ ok: false, error: "auth" }, { status: admin.status });
  const found = await deps.search(request.nextUrl.searchParams.get("q") ?? "");
  if (!found.ok) return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  return NextResponse.json({ ok: true, hits: found.hits });
}

export async function POST(
  request: NextRequest,
  _context?: unknown,
  deps: RouteDeps = { requireAdmin, search: searchBankTasks, load: loadBankTaskViews },
): Promise<NextResponse> {
  if (!allowed(request)) return NextResponse.json({ ok: false, error: "origin" }, { status: 403 });
  const admin = await deps.requireAdmin();
  if (!admin.ok) return NextResponse.json({ ok: false, error: "auth" }, { status: admin.status });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "body" }, { status: 400 });
  }
  const raw = body && typeof body === "object" && "refs" in body ? body.refs : [];
  const refs = (Array.isArray(raw) ? raw : [])
    .filter((item): item is string => typeof item === "string")
    .slice(0, REF_LIMIT)
    .flatMap((token) => {
      const parsed = parseBankTaskRef(token);
      return parsed ? [parsed] : [];
    });
  const loaded = await deps.load(refs);
  if (!loaded.ok) return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  return NextResponse.json({ ok: true, tasks: loaded.tasks, missing: loaded.missing });
}
