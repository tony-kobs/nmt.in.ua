export type StudentOption = {
  id: number;
  displayName: string;
};

export const USER_ROLES = ["student", "teacher", "admin"] as const;

export type UserRole = (typeof USER_ROLES)[number];

/**
 * `full` — ordinary platform account (register, teacher-created student, staff).
 * `marathon` — account created only by the daily-marathon join form.
 * The final CTA and an admin promotion set this back to `full`.
 * Teachers and admins are never gated by this flag.
 */
export const CABINET_SCOPES = ["full", "marathon"] as const;

export type CabinetScope = (typeof CABINET_SCOPES)[number];

export type AuthUser = {
  id: number;
  login: string;
  displayName: string;
  role: UserRole;
  /** Omitted on session-only reads. Present after `app_users` is loaded. */
  cabinetScope?: CabinetScope;
  /** Unix seconds of the stored avatar; omitted when the user has none. */
  avatarRev?: number;
  /** True when an admin banned the account (blocks login). */
  isBanned?: boolean;
  /** Normalized email when present (new registrations). */
  email?: string;
  /** True when email_verified_at is set (or demo bypass). */
  emailVerified?: boolean;
  /**
   * Public self-signup only. When true, login stays closed until the email
   * is confirmed. Absent or false: legacy rows and teacher-created students
   * can sign in; an unverified address is a banner, not a lock.
   */
  emailVerifyRequired?: boolean;
};

export type SessionPayload = {
  userId: number;
  role: UserRole;
  exp: number;
  /** Present on tokens issued after the layout-DB skip; older cookies omit these. */
  displayName?: string;
  login?: string;
  /** Present on tokens issued after avatar upload landed; older cookies omit it. */
  avatarRev?: number;
  /** `user_sessions.id`. Older cookies omit it until the next presence ping. */
  sid?: number;
};

export function avatarSrc(
  user: Pick<AuthUser, "id" | "avatarRev">,
): string | null {
  if (!user.avatarRev) return null;
  return `/api/avatar/${user.id}?v=${user.avatarRev}`;
}

export function roleLabel(role: UserRole): string {
  switch (role) {
    case "student":
      return "Учень";
    case "teacher":
      return "Викладач";
    case "admin":
      return "Адмін";
  }
}

export function userInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export function canImportContent(role: UserRole): boolean {
  return role === "admin";
}

export function canAssignMentorSessions(role: UserRole): boolean {
  return role === "teacher" || role === "admin";
}

export function canReviewConsultationRequests(role: UserRole): boolean {
  return role === "teacher" || role === "admin";
}

/** Teacher roster («Мої учні») — same staff roles as mentor assign. */
export function canManageStudents(role: UserRole): boolean {
  return role === "teacher" || role === "admin";
}

/** Platform account list (filter / ban / delete) — admin only. */
export function canManageProfiles(role: UserRole): boolean {
  return role === "admin";
}

/**
 * Sidebar hrefs for the content-editor admin cabinet.
 * Student/teacher learning paths stay available via URL, but not in the menu.
 */
export const ADMIN_NAV_HREFS = [
  "/",
  "/profiles",
  "/materials/textbook",
  "/admin/textbook",
  "/problems",
  "/feedback",
  "/leaderboard",
  "/admin/marathons",
  "/admin/support",
  "/settings",
] as const;
