import type { UserRole } from "./types";

/** Permission ids. Check these, not the role name, at call sites. */
export const MARATHON_MANAGE = "marathon:manage" as const;

export type Permission = typeof MARATHON_MANAGE;

const GRANTS: Record<Permission, readonly UserRole[]> = {
  "marathon:manage": ["admin", "dev"],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return GRANTS[permission].includes(role);
}
