import { isPlatformStaff, isViewAsRole, type UserRole, type ViewAsRole } from "./types";

/**
 * The database role is the authority.
 * `viewAs` counts only as a downgrade from admin or dev into student or teacher.
 * A student or teacher cookie cannot become staff, and a developer cannot become admin.
 */
export function effectiveRole(realRole: UserRole, viewAs: unknown): UserRole {
  if (!isPlatformStaff(realRole)) return realRole;
  if (isViewAsRole(viewAs)) return viewAs;
  return realRole;
}

export type ViewRoleDecision =
  | { ok: true; role: UserRole; viewAs: ViewAsRole | null }
  | { ok: false };

/**
 * Who may change the view, and to what.
 * `self` restores the stored role. `admin` and `dev` are not selectable targets.
 */
export function decideViewRole(realRole: UserRole, requested: unknown): ViewRoleDecision {
  if (!isPlatformStaff(realRole)) return { ok: false };
  const value = typeof requested === "string" ? requested.trim() : requested;
  if (value === "self") return { ok: true, role: realRole, viewAs: null };
  if (isViewAsRole(value)) return { ok: true, role: value, viewAs: value };
  return { ok: false };
}

export function viewHomePath(role: UserRole): string {
  if (role === "teacher") return "/assign";
  return "/";
}
