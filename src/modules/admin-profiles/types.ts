import type { CabinetScope, UserRole } from "@/modules/auth/types";

export type AdminProfile = {
  id: number;
  login: string;
  displayName: string;
  email: string | null;
  emailVerified: boolean;
  role: UserRole;
  cabinetScope: CabinetScope;
  isBanned: boolean;
  isOnline: boolean;
  /** Minutes since `last_seen_at`, from MySQL `TIMESTAMPDIFF`. Null if never seen. */
  seenMinutesAgo: number | null;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  /** Account row or a marathon chat. False when the tables are not there yet. */
  telegramLinked: boolean;
};

export const ADMIN_PROFILES_PAGE_SIZE = 10;

export type AdminProfilesRoleCounts = {
  all: number;
  student: number;
  teacher: number;
  admin: number;
};

export type AdminProfilesPage = {
  items: AdminProfile[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  roleCounts: AdminProfilesRoleCounts;
};

export type AdminProfilesErrorCode =
  | "invalid_input"
  | "not_found"
  | "forbidden"
  | "self_action"
  | "last_admin"
  | "db_error";

export class AdminProfilesError extends Error {
  constructor(
    message: string,
    public readonly code: AdminProfilesErrorCode,
  ) {
    super(message);
    this.name = "AdminProfilesError";
  }
}
