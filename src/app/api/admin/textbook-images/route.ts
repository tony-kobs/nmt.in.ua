import { NextResponse, type NextRequest } from "next/server";
import { optionalLiveUser } from "@/modules/auth/getCurrentUser";
import { TEXTBOOK_IMAGE_MAX_BYTES } from "@/modules/textbook/imageLimits";
import { saveTextbookImage } from "@/modules/textbook/imageStore";
import { textbookUploadAllowed } from "@/modules/textbook/uploadRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = TEXTBOOK_IMAGE_MAX_BYTES + 64 * 1024;

type UploadResult = { ok: true; src: string } | { ok: false; code: "type" | "size" };

type RouteDeps = {
  requireAdmin: () => Promise<{ ok: true } | { ok: false; status: 401 | 403 }>;
  saveImage: (bytes: Uint8Array) => Promise<UploadResult>;
};

async function requireAdmin(): Promise<{ ok: true } | { ok: false; status: 401 | 403 }> {
  const user = await optionalLiveUser();
  if (!user) return { ok: false, status: 401 };
  if (user.role !== "admin") return { ok: false, status: 403 };
  return { ok: true };
}

function readFile(value: FormDataEntryValue | null): File | null {
  if (typeof value !== "object" || value === null) return null;
  const file = value as File;
  if (typeof file.arrayBuffer !== "function" || typeof file.size !== "number") return null;
  return file;
}

export async function POST(
  request: NextRequest,
  _context?: unknown,
  deps: RouteDeps = { requireAdmin, saveImage: saveTextbookImage },
): Promise<NextResponse> {
  if (
    !textbookUploadAllowed({
      host: request.headers.get("host"),
      origin: request.headers.get("origin"),
      secFetchSite: request.headers.get("sec-fetch-site"),
    })
  ) {
    return NextResponse.json({ ok: false, error: "origin" }, { status: 403 });
  }

  const admin = await deps.requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ ok: false, error: "auth" }, { status: admin.status });
  }

  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_BODY) {
    return NextResponse.json({ ok: false, error: "size" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "file" }, { status: 400 });
  }
  const file = readFile(form.get("file"));
  if (!file || file.size === 0) {
    return NextResponse.json({ ok: false, error: "file" }, { status: 400 });
  }
  if (file.size > TEXTBOOK_IMAGE_MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "size" }, { status: 413 });
  }

  let saved: UploadResult;
  try {
    saved = await deps.saveImage(new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    console.error("POST /api/admin/textbook-images", error);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
  if (!saved.ok) {
    const status = saved.code === "size" ? 413 : 415;
    return NextResponse.json({ ok: false, error: saved.code }, { status });
  }
  return NextResponse.json({ ok: true, src: saved.src });
}
