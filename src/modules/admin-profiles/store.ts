import type { SqlConnection } from "@/lib/db/mysql";
import { onlineSessionExistsSql } from "@/modules/auth/presenceRules";
import {
  ensureUserSessionsSchema,
  SQL_REVOKE_USER_SESSIONS,
} from "@/modules/auth/userSessions";
import type { UserRole } from "@/modules/auth/types";
import { ensureAuthSchema } from "@/modules/auth/users";
import { AdminProfilesError, ADMIN_PROFILES_PAGE_SIZE, type AdminProfile, type AdminProfilesPage, type AdminProfilesRoleCounts } from "./types";

const SQL_PRESENCE = `
         TIMESTAMPDIFF(MINUTE, last_seen_at, CURRENT_TIMESTAMP) AS seen_minutes_ago,
         ${onlineSessionExistsSql("app_users.id")} AS is_online`;

const SQL_LIST_PROFILES = `
  SELECT id, login, display_name, email, email_verified_at, role, cabinet_scope,
         is_banned, last_login_at, last_seen_at, created_at,
${SQL_PRESENCE}
  FROM app_users
`;

const SQL_COUNT_PROFILES = `
  SELECT COUNT(*) AS total
  FROM app_users
`;

const SQL_ROLE_COUNTS = `
  SELECT role, COUNT(*) AS count
  FROM app_users
  GROUP BY role
`;

const SQL_FIND_TARGET = `
  SELECT id, login, display_name, email, email_verified_at, role, cabinet_scope,
         is_banned, last_login_at, last_seen_at, created_at,
${SQL_PRESENCE}
  FROM app_users
  WHERE id = ?
  LIMIT 1
`;

const SQL_OPEN_CABINET = `
  UPDATE app_users SET cabinet_scope = 'full' WHERE id = ? AND cabinet_scope = 'marathon'
`;

const SQL_SET_BANNED = `
  UPDATE app_users SET is_banned = ? WHERE id = ?
`;

const SQL_COUNT_ACTIVE_ADMINS = `
  SELECT COUNT(*) AS count
  FROM app_users
  WHERE role = 'admin' AND is_banned = 0
`;

type ProfileRow = {
  id: number;
  login: string;
  display_name: string;
  email: string | null;
  email_verified_at: Date | string | null;
  role: UserRole;
  cabinet_scope?: string | null;
  is_banned: number | boolean | null;
  last_login_at: Date | string | null;
  last_seen_at: Date | string | null;
  created_at: Date | string;
  is_online?: number | boolean | null;
  seen_minutes_ago?: number | string | null;
};

type CountRow = { count: number };
type TotalRow = { total: number | string };
type RoleCountRow = { role: UserRole; count: number | string };

const EMPTY_ROLE_COUNTS: AdminProfilesRoleCounts = {
  all: 0,
  student: 0,
  teacher: 0,
  admin: 0,
};

function mapRoleCounts(rows: RoleCountRow[]): AdminProfilesRoleCounts {
  const counts = { ...EMPTY_ROLE_COUNTS };
  for (const row of rows) {
    const n = Number(row.count);
    if (row.role === "student" || row.role === "teacher" || row.role === "admin") {
      counts[row.role] = n;
    }
    counts.all += n;
  }
  return counts;
}

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

async function ensureProfileSchema(deps: {
  getConnection: () => Promise<SqlConnection>;
}): Promise<void> {
  await ensureAuthSchema(deps);
  await ensureUserSessionsSchema(deps);
}

function seenMinutes(value: unknown): number | null {
  if (value == null || value === "") return null;
  const numeric = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

function formatTimestamp(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function isTruthyFlag(value: unknown): boolean {
  if (typeof value === "bigint") return value === BigInt(1);
  return value === true || value === 1 || value === "1";
}

function mapProfile(row: ProfileRow): AdminProfile {
  const lastSeenAt = formatTimestamp(row.last_seen_at);
  const lastLoginAt = formatTimestamp(row.last_login_at);
  const email = row.email?.trim() || null;
  return {
    id: row.id,
    login: row.login.trim(),
    displayName: row.display_name.trim(),
    email,
    emailVerified: Boolean(formatTimestamp(row.email_verified_at)),
    role: row.role,
    cabinetScope: row.cabinet_scope === "marathon" ? "marathon" : "full",
    isBanned: isTruthyFlag(row.is_banned),
    isOnline: isTruthyFlag(row.is_online),
    seenMinutesAgo: seenMinutes(row.seen_minutes_ago),
    lastLoginAt,
    lastSeenAt,
    createdAt: formatTimestamp(row.created_at) ?? String(row.created_at),
  };
}

export type GetAdminProfilesOptions = {
  page?: number;
  pageSize?: number;
  role?: "all" | UserRole;
};

export async function getAdminProfiles(
  options: GetAdminProfilesOptions = {},
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<AdminProfilesPage> {
  await ensureProfileSchema(deps);
  const pageSize = Math.max(
    1,
    Math.floor(options.pageSize ?? ADMIN_PROFILES_PAGE_SIZE),
  );
  const requestedPage = Math.max(1, Math.floor(options.page ?? 1));
  const roleFilter = options.role ?? "all";
  const connection = await deps.getConnection();
  try {
    const roleCounts = mapRoleCounts(
      await connection.query<RoleCountRow>(SQL_ROLE_COUNTS, []),
    );

    const where =
      roleFilter === "all" ? "" : " WHERE role = ?";
    const countParams = roleFilter === "all" ? [] : [roleFilter];
    const countRows = await connection.query<TotalRow>(
      `${SQL_COUNT_PROFILES}${where}`,
      countParams,
    );
    const total = Number(countRows[0]?.total ?? 0);
    const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;

    const listParams = roleFilter === "all" ? [] : [roleFilter];
    const rows =
      total === 0
        ? []
        : await connection.query<ProfileRow>(
            // MySQL prepared statements reject `LIMIT ?` — inline validated ints.
            `${SQL_LIST_PROFILES}${where}
  ORDER BY role ASC, display_name ASC, id ASC
  LIMIT ${pageSize} OFFSET ${offset}`,
            listParams,
          );

    return {
      items: rows.map(mapProfile),
      total,
      page,
      pageSize,
      totalPages,
      roleCounts,
    };
  } finally {
    connection.release();
  }
}

function assertValidIds(actorUserId: number, targetUserId: number): void {
  if (
    !Number.isInteger(targetUserId) ||
    targetUserId <= 0 ||
    !Number.isInteger(actorUserId) ||
    actorUserId <= 0
  ) {
    throw new AdminProfilesError("Invalid user id.", "invalid_input");
  }
}

async function loadTarget(
  connection: SqlConnection,
  targetUserId: number,
): Promise<AdminProfile> {
  const rows = await connection.query<ProfileRow>(SQL_FIND_TARGET, [
    targetUserId,
  ]);
  const row = rows[0];
  if (!row) {
    throw new AdminProfilesError("User not found.", "not_found");
  }
  return mapProfile(row);
}

function assertMutableTarget(
  actorUserId: number,
  target: AdminProfile,
): void {
  if (actorUserId === target.id) {
    throw new AdminProfilesError(
      "Cannot ban or delete your own account.",
      "self_action",
    );
  }
}

async function assertNotLastActiveAdmin(
  connection: SqlConnection,
  target: AdminProfile,
): Promise<void> {
  if (target.role !== "admin" || target.isBanned) return;
  const rows = await connection.query<CountRow>(SQL_COUNT_ACTIVE_ADMINS, []);
  const count = rows[0]?.count ?? 0;
  if (count <= 1) {
    throw new AdminProfilesError(
      "Cannot ban or delete the last active admin.",
      "last_admin",
    );
  }
}

export type SetProfileBannedInput = {
  actorUserId: number;
  targetUserId: number;
  banned: boolean;
};

export async function setProfileBanned(
  input: SetProfileBannedInput,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<AdminProfile> {
  assertValidIds(input.actorUserId, input.targetUserId);

  await ensureProfileSchema(deps);
  const connection = await deps.getConnection();
  try {
    const target = await loadTarget(connection, input.targetUserId);
    assertMutableTarget(input.actorUserId, target);

    if (input.banned && !target.isBanned) {
      await assertNotLastActiveAdmin(connection, target);
    }

    if (target.isBanned === input.banned) {
      return target;
    }

    await connection.beginTransaction();
    try {
      await connection.execute(SQL_SET_BANNED, [
        input.banned ? 1 : 0,
        input.targetUserId,
      ]);
      if (input.banned) {
        await connection.execute(SQL_REVOKE_USER_SESSIONS, [input.targetUserId]);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }

    return {
      ...target,
      isBanned: input.banned,
    };
  } catch (error) {
    if (error instanceof AdminProfilesError) throw error;
    console.error("setProfileBanned: unexpected database error", error);
    throw new AdminProfilesError("Database operation failed.", "db_error");
  } finally {
    connection.release();
  }
}

export type DeleteProfileInput = {
  actorUserId: number;
  targetUserId: number;
};

/** Removes related rows then deletes the user account. */
export async function deleteProfile(
  input: DeleteProfileInput,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<AdminProfile> {
  assertValidIds(input.actorUserId, input.targetUserId);

  await ensureProfileSchema(deps);
  const connection = await deps.getConnection();
  try {
    const target = await loadTarget(connection, input.targetUserId);
    assertMutableTarget(input.actorUserId, target);
    await assertNotLastActiveAdmin(connection, target);

    await connection.beginTransaction();
    try {
      const optionalDeletes = [
        `DELETE FROM teacher_students
         WHERE teacher_user_id = ? OR student_user_id = ?`,
        `DELETE FROM teacher_profiles WHERE user_id = ?`,
        `DELETE FROM user_avatars WHERE user_id = ?`,
        `UPDATE site_feedback SET user_id = NULL WHERE user_id = ?`,
        `UPDATE teacher_payments SET user_id = NULL WHERE user_id = ?`,
      ] as const;

      for (const sql of optionalDeletes) {
        try {
          const params = sql.includes("teacher_user_id")
            ? [input.targetUserId, input.targetUserId]
            : [input.targetUserId];
          await connection.execute(sql, params);
        } catch (error) {
          const errno =
            typeof error === "object" && error !== null && "errno" in error
              ? Number((error as { errno?: number }).errno)
              : undefined;
          // ER_NO_SUCH_TABLE — related feature not migrated yet.
          if (errno === 1146) continue;
          throw error;
        }
      }

      await connection.execute(`DELETE FROM app_users WHERE id = ?`, [
        input.targetUserId,
      ]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }

    return target;
  } catch (error) {
    if (error instanceof AdminProfilesError) throw error;
    console.error("deleteProfile: unexpected database error", error);
    throw new AdminProfilesError("Database operation failed.", "db_error");
  } finally {
    connection.release();
  }
}

export type PromotePlatformStudentInput = {
  actorUserId: number;
  targetUserId: number;
};

/** Lifts the marathon-only cabinet limit. Does not set `converted_at`. */
export async function promotePlatformStudent(
  input: PromotePlatformStudentInput,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<AdminProfile> {
  assertValidIds(input.actorUserId, input.targetUserId);
  await ensureProfileSchema(deps);
  const connection = await deps.getConnection();
  try {
    const target = await loadTarget(connection, input.targetUserId);
    if (target.role !== "student" || target.cabinetScope !== "marathon") {
      throw new AdminProfilesError(
        "Only a marathon-only student can be opened to the platform.",
        "invalid_input",
      );
    }
    await connection.execute(SQL_OPEN_CABINET, [input.targetUserId]);
    return { ...target, cabinetScope: "full" };
  } catch (error) {
    if (error instanceof AdminProfilesError) throw error;
    console.error("promotePlatformStudent: unexpected database error", error);
    throw new AdminProfilesError("Database operation failed.", "db_error");
  } finally {
    connection.release();
  }
}
