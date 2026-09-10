/**
 * HTTP endpoint for module 2 (CSV/JSON content import -> MySQL).
 *
 * Requires `Authorization: Bearer <CONTENT_IMPORT_API_KEY>`.
 *
 * Accepts `multipart/form-data` with exactly one shape:
 * - a JSON import: fields `file` and `format=json` only; or
 * - a CSV import: fields `themes`, `themeConnections`, `quizTasks` only.
 *
 * See README.md for the exact CSV headers, JSON schema, and response shape.
 */
import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedContentImportRequest } from "@/modules/content-import/auth";
import { buildImportInputFromFormData } from "@/modules/content-import/buildImportInputFromFormData";
import {
  ContentImportError,
  runContentImport,
  type ContentImportInput,
} from "@/modules/content-import";
import { logSanitizedError } from "@/modules/content-import/logging";
import { MAX_REQUEST_BODY_BYTES } from "@/modules/content-import/schema";

type RouteDeps = {
  runContentImport: typeof runContentImport;
};

const GENERIC_SERVER_ERROR = "Internal server error.";
const UNAUTHORIZED_ERROR = "Unauthorized.";

/** Longer than any plausible decimal byte count; guards against pathological header values. */
const CONTENT_LENGTH_PATTERN = /^[0-9]{1,15}$/;

/**
 * Reads the declared request size from `Content-Length` without trusting it
 * blindly: a malformed, negative, or implausibly long header value is
 * treated as absent (not fatal) — the post-parse `File.size` check below is
 * the source of truth since `Content-Length` can be missing or inaccurate.
 */
function readDeclaredContentLength(request: NextRequest): number | null {
  const raw = request.headers.get("content-length");
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (!CONTENT_LENGTH_PATTERN.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

/** Reads the multipart body and resolves it to a validated import input, or throws `ContentImportError`. */
async function buildImportInput(request: NextRequest): Promise<ContentImportInput> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new ContentImportError("validation", ["Malformed multipart/form-data payload."]);
  }
  return buildImportInputFromFormData(formData);
}

export async function POST(
  request: NextRequest,
  _context?: unknown,
  deps: RouteDeps = { runContentImport },
) {
  // Authentication is checked first, before any body parsing.
  if (!isAuthorizedContentImportRequest(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, errors: [UNAUTHORIZED_ERROR] }, { status: 401 });
  }

  // Reject an oversized declared body before `formData()` reads it into memory.
  // `Content-Length` covers the whole multipart body (boundaries and part
  // headers included), so it's checked against MAX_REQUEST_BODY_BYTES, not
  // MAX_TOTAL_UPLOAD_BYTES which only bounds actual file content below.
  const declaredLength = readDeclaredContentLength(request);
  if (declaredLength !== null && declaredLength > MAX_REQUEST_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, errors: ["Declared request size exceeds the upload limit."] },
      { status: 413 },
    );
  }

  try {
    const input = await buildImportInput(request);
    const summary = await deps.runContentImport(input);
    const { invalidateCatalogCache } = await import("@/lib/cache/catalogCache");
    invalidateCatalogCache();
    return NextResponse.json(
      {
        ok: true,
        inserted: summary.inserted,
        updated: summary.updated,
        totalInserted: summary.totalInserted,
        totalUpdated: summary.totalUpdated,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof ContentImportError) {
      switch (error.kind) {
        case "unsupported_format":
          return NextResponse.json({ ok: false, errors: error.errors }, { status: 415 });
        case "payload_too_large":
          return NextResponse.json({ ok: false, errors: error.errors }, { status: 413 });
        case "validation":
          return NextResponse.json({ ok: false, errors: error.errors }, { status: 400 });
        case "server":
        default:
          logSanitizedError("content_import.route", error);
          return NextResponse.json({ ok: false, errors: [GENERIC_SERVER_ERROR] }, { status: 500 });
      }
    }
    logSanitizedError("content_import.route", error);
    return NextResponse.json({ ok: false, errors: [GENERIC_SERVER_ERROR] }, { status: 500 });
  }
}
