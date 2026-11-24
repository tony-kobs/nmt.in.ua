import type { ParentChild } from "@/modules/parent-students/types";

/** Only roster options can initiate navigation; authorization stays on the server. */
export function parentChildHref(value: string, children: ParentChild[]): string | null {
  return children.some((child) => String(child.id) === value)
    ? `/parent?childId=${encodeURIComponent(value)}` : null;
}
