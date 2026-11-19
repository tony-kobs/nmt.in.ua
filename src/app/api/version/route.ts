import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { revisionFromRecord } from "@/lib/deployRevision";
import { lookupPublishedVersion } from "@/lib/githubReleaseTag";

export const dynamic = "force-dynamic";

const FILE = path.join(process.cwd(), "src/generated/deploy-revision.json");

/**
 * Deployed commit, plus a version. The build file is null until a later build
 * sees the tag, because the tag is created after deploy. A public GitHub tag
 * for this SHA fills that gap and is cached in the process.
 */
export async function GET(): Promise<NextResponse> {
  let record: unknown = null;
  try {
    record = JSON.parse(await readFile(FILE, "utf8")) as unknown;
  } catch {
    record = null;
  }
  const baked = revisionFromRecord(record, process.env);
  const version = baked.version ?? (baked.sha ? await lookupPublishedVersion(baked.sha) : null);
  return NextResponse.json(
    { sha: baked.sha, version },
    { headers: { "Cache-Control": "no-store" } },
  );
}
