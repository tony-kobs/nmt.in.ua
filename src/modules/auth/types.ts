export type StudentOption = {
  id: number;
  displayName: string;
};

export const USER_ROLES = ["student", "teacher", "admin"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export type AuthUser = {
  id: number;
  login: string;
  displayName: string;
  role: UserRole;
};

export type SessionPayload = {
  userId: number;
  role: UserRole;
  exp: number;
  /** Present on tokens issued after the layout-DB skip; older cookies omit these. */
  displayName?: string;
  login?: string;
};

export const DEMO_ACCOUNTS = [
  {
    login: "demo-student",
    password: "demo123",
    displayName: "Олена Коваленко",
    role: "student" as const,
    id: 1,
    description: "Учень — тести, результати, сесії",
  },
  {
    login: "demo-teacher",
    password: "demo123",
    displayName: "Ігор Петренко",
    role: "teacher" as const,
    id: 2,
    description: "Викладач — призначення mentor-сесій",
  },
  {
    login: "demo-admin",
    password: "demo123",
    displayName: "Адміністратор",
    role: "admin" as const,
    id: 3,
    description: "Адмін — імпорт контенту та налаштування",
  },
] as const;

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
