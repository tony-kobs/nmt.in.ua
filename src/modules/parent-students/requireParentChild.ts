import "server-only";

import { defaultParentReadDeps, readParentChildren, type ParentReadDeps } from "./parentAccess";
import { ParentAccessError, type ParentChild } from "./types";

/** Check current access, not a lasting grant: future progress reads must also scope their SQL. */
export async function requireParentChild(
  childId: unknown,
  deps: ParentReadDeps = defaultParentReadDeps,
): Promise<ParentChild> {
  const children = await readParentChildren({ childId }, deps);
  if (!children[0]) throw new ParentAccessError("not_found");
  return children[0];
}
