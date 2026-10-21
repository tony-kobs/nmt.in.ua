import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { SqlConnection } from "@/lib/db/mysql";
import { absoluteUrl, sendMail, type SendMailInput, type SendMailResult } from "@/modules/mail/sendMail";
import { notifyUser } from "@/modules/notifications/store";
import { mysqlErrno } from "@/modules/teacher-students/mysqlErrno";
import type { AdminProfile } from "./types";

export const DELETION_GRACE_MS = 14 * 24 * 60 * 60 * 1000;
export const DELETION_REMINDER_MS = 3 * 24 * 60 * 60 * 1000;
export const ACCOUNT_KEPT_KIND = "admin.account_kept";

export type DeleteProfileResult = {
  profile: AdminProfile;
  outcome: "deleted" | "scheduled";
  dueAt: string | null;
  mailWarning: boolean;
};

type Mailer = (input: SendMailInput) => Promise<SendMailResult>;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function formatDeletionDate(date: Date, locale = "uk"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Europe/Kyiv",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Auth letters (verify, reset) are hardcoded. There is no shared editor for them,
 * so this warning uses the same pattern. Marathon copy stays per course.
 */
export function buildDeletionLetter(input: {
  email: string;
  displayName: string;
  dueAt: Date;
  rawToken: string;
}): SendMailInput {
  const name = input.displayName.trim() || input.email;
  const when = formatDeletionDate(input.dueAt, "uk");
  const link = absoluteUrl(`/keep-account?token=${encodeURIComponent(input.rawToken)}`);
  const subject = "Ваш акаунт буде видалено — nmt.in.ua";
  const lead = `Адміністратор запланував видалення вашого акаунта на nmt.in.ua. Це станеться ${when}, якщо ви не збережете його.`;
  const text = [
    `Вітаємо, ${name}!`,
    "",
    lead,
    "",
    "Щоб скасувати видалення, натисніть «Зберегти акаунт»:",
    link,
    "",
    "Увійти в кабінет теж скасовує видалення.",
    "Посилання дійсне до цієї дати і спрацює один раз.",
  ].join("\n");
  const html = `
    <p>Вітаємо, <strong>${escapeHtml(name)}</strong>!</p>
    <p>${escapeHtml(lead)}</p>
    <p><a href="${escapeHtml(link)}">Зберегти акаунт</a></p>
    <p>Увійти в кабінет теж скасовує видалення. Посилання дійсне до ${escapeHtml(when)} і спрацює один раз.</p>
  `;
  return { to: input.email, subject, text, html };
}

const CLEAR_SQL = `
  UPDATE app_users
  SET deletion_requested_at = NULL,
      deletion_due_at = NULL,
      deletion_requested_by = NULL,
      deletion_cancel_token_hash = NULL,
      deletion_reminder_sent_at = NULL
  WHERE id = ? AND deletion_due_at IS NOT NULL
`;

async function purgeAccount(
  connection: SqlConnection,
  userId: number,
  onlyIfDueBefore?: Date,
): Promise<boolean> {
  const optionalDeletes = [
    `DELETE FROM teacher_students WHERE teacher_user_id = ? OR student_user_id = ?`,
    `DELETE FROM teacher_profiles WHERE user_id = ?`,
    `DELETE FROM user_avatars WHERE user_id = ?`,
    `UPDATE site_feedback SET user_id = NULL WHERE user_id = ?`,
    `UPDATE teacher_payments SET user_id = NULL WHERE user_id = ?`,
  ] as const;
  await connection.beginTransaction();
  try {
    if (onlyIfDueBefore) {
      const locked = await connection.query<{ id: number }>(
        `SELECT id FROM app_users
         WHERE id = ? AND deletion_due_at IS NOT NULL AND deletion_due_at <= ?
         LIMIT 1 FOR UPDATE`,
        [userId, onlyIfDueBefore],
      );
      if (!locked[0]) {
        await connection.rollback();
        return false;
      }
    }
    for (const sql of optionalDeletes) {
      try {
        const params = sql.includes("teacher_user_id") ? [userId, userId] : [userId];
        await connection.execute(sql, params);
      } catch (error) {
        if (mysqlErrno(error) === 1146) continue;
        throw error;
      }
    }
    await connection.execute(`DELETE FROM app_users WHERE id = ?`, [userId]);
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function silencePendingSends(connection: SqlConnection, userId: number): Promise<void> {
  const statements = [
    `UPDATE marathon_message_jobs
     SET status = 'cancelled', error_text = 'Видалення акаунта заплановано'
     WHERE user_id = ? AND status IN ('queued', 'sending')`,
    `UPDATE marathon_telegram_outbox
     SET status = 'cancelled', error_text = 'Видалення акаунта заплановано'
     WHERE status = 'pending'
       AND (
         chat_id IN (SELECT CAST(telegram_chat_id AS CHAR) FROM marathon_participants WHERE user_id = ?)
         OR chat_id IN (SELECT CAST(telegram_chat_id AS CHAR) FROM user_telegram_accounts WHERE user_id = ?)
       )`,
  ];
  for (const sql of statements) {
    try {
      const params = sql.includes("user_telegram_accounts") ? [userId, userId] : [userId];
      await connection.execute(sql, params);
    } catch (error) {
      if (mysqlErrno(error) === 1146 || mysqlErrno(error) === 1054) continue;
      throw error;
    }
  }
}

async function tellAdmins(input: {
  userId: number;
  displayName: string;
  login: string;
  getConnection: () => Promise<SqlConnection>;
  notify?: typeof notifyUser;
}): Promise<void> {
  const notify = input.notify ?? notifyUser;
  const connection = await input.getConnection();
  let admins: Array<{ id: number }> = [];
  try {
    admins = await connection.query<{ id: number }>(
      `SELECT id FROM app_users WHERE role = 'admin' AND is_banned = 0`,
      [],
    );
  } finally {
    connection.release();
  }
  const name = input.displayName.trim() || input.login;
  for (const admin of admins) {
    try {
      await notify(
        {
          userId: Number(admin.id),
          kind: ACCOUNT_KEPT_KIND,
          title: "Акаунт збережено",
          body: `${name} скасував(ла) видалення акаунта.`,
          link: "/profiles",
        },
        input.getConnection,
      );
    } catch (error) {
      console.error("account kept notice", error);
    }
  }
}

export async function applyDeletionSchedule(input: {
  connection: SqlConnection;
  actorUserId: number;
  target: AdminProfile;
  now?: Date;
  sendMail?: Mailer;
}): Promise<DeleteProfileResult> {
  if (input.target.isBanned) {
    await purgeAccount(input.connection, input.target.id);
    return { profile: input.target, outcome: "deleted", dueAt: null, mailWarning: false };
  }
  if (input.target.deletionDueAt) {
    return {
      profile: input.target,
      outcome: "scheduled",
      dueAt: input.target.deletionDueAt,
      mailWarning: false,
    };
  }
  const now = input.now ?? new Date();
  const due = new Date(now.getTime() + DELETION_GRACE_MS);
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  await input.connection.beginTransaction();
  try {
    await input.connection.execute(
      `UPDATE app_users
       SET deletion_requested_at = ?,
           deletion_due_at = ?,
           deletion_requested_by = ?,
           deletion_cancel_token_hash = ?,
           deletion_reminder_sent_at = NULL
       WHERE id = ? AND is_banned = 0 AND deletion_due_at IS NULL`,
      [now, due, input.actorUserId, tokenHash, input.target.id],
    );
    await input.connection.commit();
  } catch (error) {
    await input.connection.rollback();
    throw error;
  }
  try {
    await silencePendingSends(input.connection, input.target.id);
  } catch (error) {
    console.error("silence pending sends", error);
  }
  const dueAt = due.toISOString();
  const email = input.target.email?.trim();
  if (!email) {
    return { profile: input.target, outcome: "scheduled", dueAt, mailWarning: true };
  }
  const deliver = input.sendMail ?? sendMail;
  try {
    const result = await deliver(buildDeletionLetter({
      email,
      displayName: input.target.displayName,
      dueAt: due,
      rawToken,
    }));
    return {
      profile: input.target,
      outcome: "scheduled",
      dueAt,
      mailWarning: !result.ok,
    };
  } catch (error) {
    console.error("deletion warning mail", error);
    return { profile: input.target, outcome: "scheduled", dueAt, mailWarning: true };
  }
}

type DueRow = {
  id: number;
  login: string;
  display_name: string;
  email: string | null;
  role: string;
  is_banned: number | boolean | null;
  deletion_due_at: Date | string;
  deletion_reminder_sent_at: Date | string | null;
};

function asDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function processDueAccountDeletions(deps: {
  now?: Date;
  getConnection: () => Promise<SqlConnection>;
  sendMail?: Mailer;
} ): Promise<{ deleted: number; reminded: number }> {
  const now = deps.now ?? new Date();
  const connection = await deps.getConnection();
  let rows: DueRow[] = [];
  try {
    rows = await connection.query<DueRow>(
      `SELECT id, login, display_name, email, role, is_banned,
              deletion_due_at, deletion_reminder_sent_at
       FROM app_users
       WHERE deletion_due_at IS NOT NULL`,
      [],
    );
  } finally {
    connection.release();
  }
  let deleted = 0;
  let reminded = 0;
  const deliver = deps.sendMail ?? sendMail;
  for (const row of rows) {
    const due = asDate(row.deletion_due_at);
    if (!due) continue;
    if (due.getTime() <= now.getTime()) {
      const worker = await deps.getConnection();
      try {
        if (row.role === "admin" && !row.is_banned) {
          const counts = await worker.query<{ count: number }>(
            `SELECT COUNT(*) AS count FROM app_users WHERE role = 'admin' AND is_banned = 0`,
            [],
          );
          if (Number(counts[0]?.count ?? 0) <= 1) continue;
        }
        const removed = await purgeAccount(worker, row.id, now);
        if (removed) deleted += 1;
      } catch (error) {
        console.error("due account deletion", error);
      } finally {
        worker.release();
      }
      continue;
    }
    if (row.deletion_reminder_sent_at) continue;
    if (due.getTime() - now.getTime() > DELETION_REMINDER_MS) continue;
    const email = row.email?.trim();
    let sent = false;
    if (email) {
      try {
        const result = await deliver(buildReminderLetter({
          email,
          displayName: row.display_name,
          dueAt: due,
        }));
        sent = result.ok;
      } catch (error) {
        console.error("deletion reminder", error);
      }
    }
    if (!email || sent) {
      const marker = await deps.getConnection();
      try {
        await marker.execute(
          `UPDATE app_users SET deletion_reminder_sent_at = ? WHERE id = ? AND deletion_reminder_sent_at IS NULL`,
          [now, row.id],
        );
        if (sent) reminded += 1;
      } finally {
        marker.release();
      }
    }
  }
  return { deleted, reminded };
}

/** The raw keep-link lives only in the first letter. The reminder points at login. */
export function buildReminderLetter(input: {
  email: string;
  displayName: string;
  dueAt: Date;
}): SendMailInput {
  const name = input.displayName.trim() || input.email;
  const when = formatDeletionDate(input.dueAt, "uk");
  const login = absoluteUrl("/login");
  const subject = "Нагадування: акаунт буде видалено — nmt.in.ua";
  const text = [
    `Вітаємо, ${name}!`,
    "",
    `Акаунт на nmt.in.ua буде видалено ${when}, якщо нічого не зробити.`,
    "Увійдіть у кабінет — це скасує видалення.",
    login,
    "",
    "Кнопка «Зберегти акаунт» лишається в першому листі.",
  ].join("\n");
  const html = `
    <p>Вітаємо, <strong>${escapeHtml(name)}</strong>!</p>
    <p>Акаунт на nmt.in.ua буде видалено ${escapeHtml(when)}, якщо нічого не зробити.</p>
    <p><a href="${escapeHtml(login)}">Увійти і зберегти акаунт</a></p>
    <p>Кнопка «Зберегти акаунт» лишається в першому листі.</p>
  `;
  return { to: input.email, subject, text, html };
}

async function clearSchedule(connection: SqlConnection, userId: number): Promise<boolean> {
  const result = await connection.execute(CLEAR_SQL, [userId]);
  return result.affectedRows > 0;
}

export async function cancelDeletionByToken(
  rawToken: string,
  deps: {
    getConnection: () => Promise<SqlConnection>;
    notify?: typeof notifyUser;
  },
): Promise<"kept" | "invalid"> {
  const trimmed = rawToken.trim();
  if (!trimmed) return "invalid";
  const connection = await deps.getConnection();
  try {
    const tokenHash = hashToken(trimmed);
    const rows = await connection.query<{
      id: number;
      login: string;
      display_name: string;
      deletion_cancel_token_hash: string | null;
    }>(
      `SELECT id, login, display_name, deletion_cancel_token_hash
       FROM app_users
       WHERE deletion_cancel_token_hash = ? AND deletion_due_at IS NOT NULL
       LIMIT 1`,
      [tokenHash],
    );
    const row = rows[0];
    if (!row?.deletion_cancel_token_hash || !sameHash(row.deletion_cancel_token_hash, tokenHash)) {
      return "invalid";
    }
    const cleared = await clearSchedule(connection, row.id);
    if (!cleared) return "invalid";
    await tellAdmins({
      userId: row.id,
      displayName: row.display_name,
      login: row.login,
      getConnection: deps.getConnection,
      notify: deps.notify,
    });
    return "kept";
  } finally {
    connection.release();
  }
}

export async function cancelDeletionOnLogin(
  userId: number,
  deps: {
    getConnection: () => Promise<SqlConnection>;
    notify?: typeof notifyUser;
  },
): Promise<boolean> {
  if (!Number.isInteger(userId) || userId <= 0) return false;
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<{
      id: number;
      login: string;
      display_name: string;
    }>(
      `SELECT id, login, display_name FROM app_users WHERE id = ? AND deletion_due_at IS NOT NULL LIMIT 1`,
      [userId],
    );
    const row = rows[0];
    if (!row) return false;
    const cleared = await clearSchedule(connection, row.id);
    if (!cleared) return false;
    await tellAdmins({
      userId: row.id,
      displayName: row.display_name,
      login: row.login,
      getConnection: deps.getConnection,
      notify: deps.notify,
    });
    return true;
  } finally {
    connection.release();
  }
}

export async function cancelDeletionByAdmin(input: {
  targetUserId: number;
  getConnection: () => Promise<SqlConnection>;
}): Promise<boolean> {
  const connection = await input.getConnection();
  try {
    return await clearSchedule(connection, input.targetUserId);
  } finally {
    connection.release();
  }
}
