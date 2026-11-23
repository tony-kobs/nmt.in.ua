import { readFile } from "node:fs/promises";
import path from "node:path";
import { revisionFromRecord, type DeployRevision } from "./deployRevision";

const FILE = path.join(process.cwd(), "src/generated/deploy-revision.json");

let cached: DeployRevision | undefined;

/** Latest release tag baked at build, if this deploy recorded one. */
export async function readDeployRevision(): Promise<DeployRevision> {
  if (cached) return cached;
  let record: unknown = null;
  try {
    record = JSON.parse(await readFile(FILE, "utf8")) as unknown;
  } catch {
    record = null;
  }
  cached = revisionFromRecord(record, process.env);
  return cached;
}
