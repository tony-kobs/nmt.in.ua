import "server-only";

import { defaultParentReadDeps, readParentChildren, type ParentReadDeps } from "./parentAccess";
import type { ParentChild } from "./types";

/** List only active student accounts linked to the current parent session. */
export async function getParentChildren(deps: ParentReadDeps = defaultParentReadDeps): Promise<ParentChild[]> {
  return readParentChildren({}, deps);
}
