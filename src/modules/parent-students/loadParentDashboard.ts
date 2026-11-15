import "server-only";

import { getParentChildren } from "./getParentChildren";
import { getChildProgress } from "./getChildProgress";
import { ParentAccessError } from "./types";

type DashboardDeps = {
  getChildren: typeof getParentChildren;
  getProgress: typeof getChildProgress;
};

/** URL input is untrusted; the progress reader checks access again in every query. */
export async function loadParentDashboard(
  rawChildId: string | string[] | undefined,
  deps: DashboardDeps = { getChildren: getParentChildren, getProgress: getChildProgress },
) {
  const children = await deps.getChildren();
  let childId: number | undefined;
  if (rawChildId !== undefined) {
    if (typeof rawChildId !== "string" || !/^[1-9]\d*$/.test(rawChildId)) {
      throw new ParentAccessError("not_found");
    }
    childId = Number(rawChildId);
    if (!Number.isSafeInteger(childId) || !children.some((child) => child.id === childId)) {
      throw new ParentAccessError("not_found");
    }
  } else {
    childId = children[0]?.id;
  }
  const progress = childId === undefined ? null : await deps.getProgress(childId);
  return { children, progress };
}
