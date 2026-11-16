import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { zonedWallTimeToUtc } from "@/modules/marathons/daily/calendar";
import { ensureAuthSchema } from "@/modules/auth/users";
import { isPlatformStaff, type UserRole } from "@/modules/auth/types";
import { mysqlErrno } from "@/modules/teacher-students/mysqlErrno";
import { ensureTeacherStudentsSchema } from "@/modules/teacher-students/schema";
import { ensureTeacherProfileSchema } from "@/modules/teachers/schema";
import { ensurePromoSchema } from "./schema";
import {
  accessBase,
  addAccessDays,
  isTeacherIdRef,
  normalizePromoCode,
  normalizeTeacherRef,
  parseAccessDays,
  parseMaxUses,
  type PromoWriteCode,
  type RedeemCode,
} from "./values";

export type { PromoWriteCode, RedeemCode };

export type PromoCodeView = {
  id: number;
  code: string;
  teacherId: number | null;
  teacherName: string | null;
  accessDays: number;
  maxUses: number | null;
  used: number;
  expiresAt: string | null;
  active: boolean;
  redeemers: string[];
};

export type StudentAccess = {
  accessUntil: string | null;
  teachers: string[];
};

export type RedeemSuccess = {
  ok: true;
  accessUntil: Date;
  teacherLinked: boolean;
  teacherName: string | null;
};

export type RedeemFailure = { ok: false; code: RedeemCode };

type StoreDeps = {
  getConnection: () => Promise<SqlConnection>;
  now?: () => Date;
};

type UserRow = {
  id: number;
  role: string;
  display_name: string;
  is_banned: number | boolean | null;
};

function asDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function asFlag(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function banned(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

async function prepare(
  deps: StoreDeps,
): Promise<void> {
  await ensureAuthSchema({ getConnection: deps.getConnection });
  await ensurePromoSchema(deps.getConnection);
  await ensureTeacherStudentsSchema(deps.getConnection);
  await ensureTeacherProfileSchema(deps.getConnection);
}

const SQL_USER = `
  SELECT id, role, display_name, is_banned
  FROM app_users
  WHERE id = ?
  LIMIT 1
`;

const SQL_TEACHER_BY_SLUG = `
  SELECT u.id, u.role, u.display_name, u.is_banned
  FROM teacher_profiles p
  INNER JOIN app_users u ON u.id = p.user_id
  WHERE p.slug = ?
  LIMIT 1
`;

export async function resolveTeacherRef(
  raw: unknown,
  deps: StoreDeps = { getConnection: loadDefaultConnection },
): Promise<{ id: number; displayName: string } | null> {
  const ref = normalizeTeacherRef(raw);
  if (!ref) return null;
  await prepare(deps);
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<UserRow>(
      isTeacherIdRef(ref) ? `${SQL_USER}` : SQL_TEACHER_BY_SLUG,
      isTeacherIdRef(ref) ? [Number(ref)] : [ref],
    );
    const row = rows[0];
    if (!row || row.role !== "teacher" || banned(row.is_banned)) return null;
    return { id: row.id, displayName: row.display_name.trim() };
  } finally {
    connection.release();
  }
}

export function parseKyivDateTimeLocal(raw: unknown): Date | null | "invalid" {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (text === "") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(text);
  if (!match) return "invalid";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return "invalid";
  }
  const parsed = zonedWallTimeToUtc(year, month, day, hour, minute);
  if (Number.isNaN(parsed.getTime())) return "invalid";
  return parsed;
}

export type CreatePromoInput = {
  actorId: number;
  actorRole: UserRole;
  code: unknown;
  accessDays: unknown;
  maxUses: unknown;
  expiresAt: unknown;
  /** Ignored for a teacher: the code is bound to the actor. */
  teacherRef: unknown;
};

export async function createPromoCode(
  input: CreatePromoInput,
  deps: StoreDeps = { getConnection: loadDefaultConnection },
): Promise<{ ok: true; id: number } | { ok: false; code: PromoWriteCode }> {
  if (!isPlatformStaff(input.actorRole) && input.actorRole !== "teacher") {
    return { ok: false, code: "forbidden" };
  }
  const code = normalizePromoCode(input.code);
  if (!code) return { ok: false, code: "invalid_code" };
  const accessDays = parseAccessDays(input.accessDays);
  if (accessDays == null) return { ok: false, code: "invalid_days" };
  const maxUses = parseMaxUses(input.maxUses);
  if (maxUses === "invalid") return { ok: false, code: "invalid_uses" };
  const expiresAt = parseKyivDateTimeLocal(input.expiresAt);
  if (expiresAt === "invalid") return { ok: false, code: "invalid_expiry" };

  await prepare(deps);

  let teacherId: number | null = null;
  if (input.actorRole === "teacher") {
    teacherId = input.actorId;
  } else if (typeof input.teacherRef === "string" && input.teacherRef.trim() !== "") {
    const teacher = await resolveTeacherRef(input.teacherRef, deps);
    if (!teacher) return { ok: false, code: "teacher_not_found" };
    teacherId = teacher.id;
  }

  const connection = await deps.getConnection();
  try {
    const inserted = await connection.execute(
      `INSERT INTO promo_codes
        (code, teacher_id, access_days, max_uses, expires_at, active, created_by)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [code, teacherId, accessDays, maxUses, expiresAt, input.actorId],
    );
    if (inserted.affectedRows !== 1) return { ok: false, code: "server" };
    return { ok: true, id: inserted.insertId };
  } catch (error) {
    if (mysqlErrno(error) === 1062) return { ok: false, code: "code_taken" };
    console.error("createPromoCode: unexpected database error", error);
    return { ok: false, code: "server" };
  } finally {
    connection.release();
  }
}

export async function setPromoActive(
  input: { actorId: number; actorRole: UserRole; promoId: number; active: boolean },
  deps: StoreDeps = { getConnection: loadDefaultConnection },
): Promise<{ ok: true } | { ok: false; code: PromoWriteCode }> {
  if (!isPlatformStaff(input.actorRole) && input.actorRole !== "teacher") {
    return { ok: false, code: "forbidden" };
  }
  if (!Number.isInteger(input.promoId) || input.promoId < 1) {
    return { ok: false, code: "not_found" };
  }
  await prepare(deps);
  const connection = await deps.getConnection();
  try {
    const sql = isPlatformStaff(input.actorRole)
      ? `UPDATE promo_codes SET active = ? WHERE id = ?`
      : `UPDATE promo_codes SET active = ? WHERE id = ? AND teacher_id = ?`;
    const params = isPlatformStaff(input.actorRole)
      ? [input.active ? 1 : 0, input.promoId]
      : [input.active ? 1 : 0, input.promoId, input.actorId];
    const updated = await connection.execute(sql, params);
    if (updated.affectedRows !== 1) return { ok: false, code: "not_found" };
    return { ok: true };
  } catch (error) {
    console.error("setPromoActive: unexpected database error", error);
    return { ok: false, code: "server" };
  } finally {
    connection.release();
  }
}

type ListRow = {
  id: number;
  code: string;
  teacher_id: number | null;
  teacher_name: string | null;
  access_days: number;
  max_uses: number | null;
  expires_at: Date | string | null;
  active: number | boolean;
  used_count: number;
};

type RedeemerRow = {
  promo_code_id: number;
  display_name: string;
};

export async function listPromoCodes(
  input: { actorId: number; actorRole: UserRole },
  deps: StoreDeps = { getConnection: loadDefaultConnection },
): Promise<PromoCodeView[]> {
  if (!isPlatformStaff(input.actorRole) && input.actorRole !== "teacher") return [];
  await prepare(deps);
  const connection = await deps.getConnection();
  try {
    const staff = isPlatformStaff(input.actorRole);
    const rows = await connection.query<ListRow>(
      `SELECT c.id, c.code, c.teacher_id, t.display_name AS teacher_name,
              c.access_days, c.max_uses, c.expires_at, c.active,
              (SELECT COUNT(*) FROM promo_redemptions r WHERE r.promo_code_id = c.id) AS used_count
       FROM promo_codes c
       LEFT JOIN app_users t ON t.id = c.teacher_id
       ${staff ? "" : "WHERE c.teacher_id = ?"}
       ORDER BY c.id DESC`,
      staff ? [] : [input.actorId],
    );
    const ids = rows.map((row) => row.id);
    const redeemers = new Map<number, string[]>();
    if (ids.length > 0) {
      const placeholders = ids.map(() => "?").join(", ");
      const names = await connection.query<RedeemerRow>(
        `SELECT r.promo_code_id, u.display_name
         FROM promo_redemptions r
         INNER JOIN app_users u ON u.id = r.user_id
         WHERE r.promo_code_id IN (${placeholders})
         ORDER BY r.id DESC`,
        ids,
      );
      for (const name of names) {
        const list = redeemers.get(name.promo_code_id) ?? [];
        if (list.length < 8) list.push(name.display_name.trim());
        redeemers.set(name.promo_code_id, list);
      }
    }
    return rows.map((row) => {
      const expires = asDate(row.expires_at);
      return {
        id: row.id,
        code: row.code,
        teacherId: row.teacher_id,
        teacherName: row.teacher_name?.trim() || null,
        accessDays: Number(row.access_days),
        maxUses: row.max_uses == null ? null : Number(row.max_uses),
        used: Number(row.used_count),
        expiresAt: expires ? expires.toISOString() : null,
        active: asFlag(row.active),
        redeemers: redeemers.get(row.id) ?? [],
      };
    });
  } finally {
    connection.release();
  }
}

type CodeLockRow = {
  id: number;
  teacher_id: number | null;
  access_days: number;
  max_uses: number | null;
  expires_at: Date | string | null;
  active: number | boolean;
  teacher_name: string | null;
  teacher_role: string | null;
  teacher_banned: number | boolean | null;
};

async function linkPair(
  connection: SqlConnection,
  teacherId: number,
  studentId: number,
): Promise<"created" | "exists" | "skipped"> {
  if (teacherId === studentId) return "skipped";
  try {
    const inserted = await connection.execute(
      `INSERT INTO teacher_students (teacher_user_id, student_user_id) VALUES (?, ?)`,
      [teacherId, studentId],
    );
    return inserted.affectedRows === 1 ? "created" : "skipped";
  } catch (error) {
    if (mysqlErrno(error) === 1062) return "exists";
    throw error;
  }
}

export async function linkStudentToTeacher(
  studentId: number,
  teacherId: number,
  deps: StoreDeps = { getConnection: loadDefaultConnection },
): Promise<boolean> {
  if (!Number.isInteger(studentId) || !Number.isInteger(teacherId)) return false;
  if (studentId < 1 || teacherId < 1 || studentId === teacherId) return false;
  await prepare(deps);
  const connection = await deps.getConnection();
  try {
    const status = await linkPair(connection, teacherId, studentId);
    return status === "created" || status === "exists";
  } finally {
    connection.release();
  }
}

/**
 * Grants free access for the code's N days and, when the code names a teacher,
 * links that teacher. Does not change the student's role or any other right.
 * A second code extends the window from whichever end is later.
 */
export async function redeemPromo(
  input: { userId: number; code: unknown },
  deps: StoreDeps = { getConnection: loadDefaultConnection },
): Promise<RedeemSuccess | RedeemFailure> {
  const code = normalizePromoCode(input.code);
  if (!code) return { ok: false, code: "invalid" };
  const now = (deps.now ?? (() => new Date()))();
  await prepare(deps);
  const connection = await deps.getConnection();
  try {
    await connection.beginTransaction();
    const users = await connection.query<UserRow>(
      `${SQL_USER.trim()} FOR UPDATE`,
      [input.userId],
    );
    const user = users[0];
    if (!user || user.role !== "student" || banned(user.is_banned)) {
      await connection.rollback();
      return { ok: false, code: "not_student" };
    }
    const codes = await connection.query<CodeLockRow>(
      `SELECT c.id, c.teacher_id, c.access_days, c.max_uses, c.expires_at, c.active,
              t.display_name AS teacher_name, t.role AS teacher_role,
              t.is_banned AS teacher_banned
       FROM promo_codes c
       LEFT JOIN app_users t ON t.id = c.teacher_id
       WHERE c.code = ?
       LIMIT 1
       FOR UPDATE`,
      [code],
    );
    const promo = codes[0];
    if (!promo) {
      await connection.rollback();
      return { ok: false, code: "unknown" };
    }
    if (!asFlag(promo.active)) {
      await connection.rollback();
      return { ok: false, code: "inactive" };
    }
    const expires = asDate(promo.expires_at);
    if (expires && expires.getTime() <= now.getTime()) {
      await connection.rollback();
      return { ok: false, code: "expired" };
    }
    const counts = await connection.query<{ used: number }>(
      `SELECT COUNT(*) AS used FROM promo_redemptions WHERE promo_code_id = ?`,
      [promo.id],
    );
    const used = Number(counts[0]?.used ?? 0);
    if (promo.max_uses != null && used >= Number(promo.max_uses)) {
      await connection.rollback();
      return { ok: false, code: "exhausted" };
    }
    const existing = await connection.query<{ id: number }>(
      `SELECT id FROM promo_redemptions
       WHERE promo_code_id = ? AND user_id = ?
       LIMIT 1
       FOR UPDATE`,
      [promo.id, input.userId],
    );
    if (existing[0]) {
      await connection.rollback();
      return { ok: false, code: "already" };
    }
    const windows = await connection.query<{ until: Date | string | null }>(
      `SELECT MAX(access_until) AS until FROM promo_redemptions WHERE user_id = ?`,
      [input.userId],
    );
    const accessUntil = addAccessDays(
      accessBase(now, asDate(windows[0]?.until ?? null)),
      Number(promo.access_days),
    );
    try {
      const inserted = await connection.execute(
        `INSERT INTO promo_redemptions (promo_code_id, user_id, access_until)
         VALUES (?, ?, ?)`,
        [promo.id, input.userId, accessUntil],
      );
      if (inserted.affectedRows !== 1) {
        await connection.rollback();
        return { ok: false, code: "server" };
      }
    } catch (error) {
      await connection.rollback();
      if (mysqlErrno(error) === 1062) return { ok: false, code: "already" };
      throw error;
    }
    let teacherLinked = false;
    let teacherName: string | null = null;
    if (
      promo.teacher_id &&
      promo.teacher_role === "teacher" &&
      !banned(promo.teacher_banned)
    ) {
      const status = await linkPair(connection, promo.teacher_id, input.userId);
      teacherLinked = status === "created" || status === "exists";
      teacherName = promo.teacher_name?.trim() || null;
    }
    await connection.commit();
    return { ok: true, accessUntil, teacherLinked, teacherName };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      /* the transaction may already be closed */
    }
    console.error("redeemPromo: unexpected database error", error);
    return { ok: false, code: "server" };
  } finally {
    connection.release();
  }
}

export async function getStudentAccess(
  userId: number,
  deps: StoreDeps = { getConnection: loadDefaultConnection },
): Promise<StudentAccess> {
  await prepare(deps);
  const connection = await deps.getConnection();
  try {
    const windows = await connection.query<{ until: Date | string | null }>(
      `SELECT MAX(access_until) AS until FROM promo_redemptions WHERE user_id = ?`,
      [userId],
    );
    const teachers = await connection.query<{ display_name: string }>(
      `SELECT u.display_name
       FROM teacher_students ts
       INNER JOIN app_users u ON u.id = ts.teacher_user_id
       WHERE ts.student_user_id = ?
       ORDER BY u.display_name ASC, u.id ASC`,
      [userId],
    );
    const until = asDate(windows[0]?.until ?? null);
    return {
      accessUntil: until ? until.toISOString() : null,
      teachers: teachers.map((row) => row.display_name.trim()).filter(Boolean),
    };
  } finally {
    connection.release();
  }
}

export type PromoPreview = {
  code: string;
  accessDays: number;
  usable: boolean;
};

export async function previewPromo(
  raw: unknown,
  deps: StoreDeps & { now?: () => Date } = { getConnection: loadDefaultConnection },
): Promise<PromoPreview | null> {
  const code = normalizePromoCode(raw);
  if (!code) return null;
  const now = (deps.now ?? (() => new Date()))();
  await prepare(deps);
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<CodeLockRow>(
      `SELECT c.id, c.teacher_id, c.access_days, c.max_uses, c.expires_at, c.active,
              t.display_name AS teacher_name, t.role AS teacher_role,
              t.is_banned AS teacher_banned
       FROM promo_codes c
       LEFT JOIN app_users t ON t.id = c.teacher_id
       WHERE c.code = ?
       LIMIT 1`,
      [code],
    );
    const promo = rows[0];
    if (!promo) return { code, accessDays: 0, usable: false };
    const expires = asDate(promo.expires_at);
    const counts = await connection.query<{ used: number }>(
      `SELECT COUNT(*) AS used FROM promo_redemptions WHERE promo_code_id = ?`,
      [promo.id],
    );
    const used = Number(counts[0]?.used ?? 0);
    const usable =
      asFlag(promo.active) &&
      !(expires && expires.getTime() <= now.getTime()) &&
      !(promo.max_uses != null && used >= Number(promo.max_uses));
    return { code, accessDays: Number(promo.access_days), usable };
  } finally {
    connection.release();
  }
}
