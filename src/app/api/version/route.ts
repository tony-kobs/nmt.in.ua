import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { revisionFromRecord } from "@/lib/deployRevision";

export const dynamic = "force-dynamic";

const FILE = path.join(process.cwd(), "src/generated/deploy-revision.json");

/** Deployed commit and the latest vX.Y.Z known at build. Not cached. */
export async function GET(): Promise<NextResponse> {
  let record: unknown = null;
  try {
    record = JSON.parse(await readFile(FILE, "utf8")) as unknown;
  } catch {
    record = null;
  }
  return NextResponse.json(revisionFromRecord(record, process.env), {
    headers: { "Cache-Control": "no-store" },
  });
}
