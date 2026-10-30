import { NextResponse, type NextRequest } from "next/server";
import { optionalLiveUser } from "@/modules/auth/getCurrentUser";
import { DOCX_MAX_BYTES, importDocx } from "@/modules/textbook/importDocx";
import { htmlToTextbookMarkup, materializeImportImages } from "@/modules/textbook/importHtml";
import { saveTextbookImage } from "@/modules/textbook/imageStore";
import { textbookUploadAllowed } from "@/modules/textbook/uploadRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HTML_MAX = 1_500_000;

type AdminGate = { ok: true } | { ok: false; status: 401 | 403 };

type Saved = { ok: true; src: string } | { ok: false };

type RouteDeps = {
  requireAdmin: () => Promise<AdminGate>;
  saveImage: (bytes: Uint8Array) => Promise<Saved>;
  readDocx: typeof importDocx;
};

async function requireAdmin(): Promise<AdminGate> {
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
  deps: RouteDeps = { requireAdmin, saveImage: saveTextbookImage, readDocx: importDocx },
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
  if (!admin.ok) return NextResponse.json({ ok: false, error: "auth" }, { status: admin.status });

  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > DOCX_MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ ok: false, error: "size" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "file" }, { status: 400 });
  }

  const html = form.get("html");
  if (typeof html === "string") {
    if (html.length > HTML_MAX) return NextResponse.json({ ok: false, error: "size" }, { status: 413 });
    try {
      const draft = await materializeImportImages(htmlToTextbookMarkup(html), deps.saveImage);
      return NextResponse.json({ ok: true, markup: draft.markup, summary: draft.summary });
    } catch (error) {
      console.error("POST /api/admin/textbook-import html", error);
      return NextResponse.json({ ok: false, error: "read" }, { status: 400 });
    }
  }

  const file = readFile(form.get("file"));
  if (!file || file.size === 0) return NextResponse.json({ ok: false, error: "file" }, { status: 400 });
  const docx =
    file.name.toLowerCase().endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (!docx) return NextResponse.json({ ok: false, error: "type" }, { status: 415 });
  if (file.size > DOCX_MAX_BYTES) return NextResponse.json({ ok: false, error: "size" }, { status: 413 });

  const imported = await deps.readDocx(new Uint8Array(await file.arrayBuffer()), deps.saveImage);
  if (!imported.ok) {
    const status = imported.error === "size" ? 413 : 400;
    return NextResponse.json({ ok: false, error: imported.error }, { status });
  }
  return NextResponse.json({
    ok: true,
    markup: imported.draft.markup,
    summary: imported.draft.summary,
  });
}
