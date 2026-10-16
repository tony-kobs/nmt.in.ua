import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import {
  shouldInsertNotification,
  type NotificationSnapshot,
} from "./logic";
import {
  ensureUserNotificationsSchema,
} from "./schema";

export type UserNotification = NotificationSnapshot;

export type NotifyUserInput = {
  userId: number;
  kind: string;
  title: string;
  body: string;
  link?: string | null;
  /** Skip when this user already has the same kind and link. */
  once?: boolean;
};

type Conn = () => Promise<SqlConnection>;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

function clip(value: string, max: number): string {
  return value.trim().slice(0, max);
}

type Row = {
  id: number;
  user_id: number;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  created_at: unknown;
  read_at: unknown;
};

function asStamp(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  return text || null;
}

function mapRow(row: Row): UserNotification {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    kind: row.kind,
    title: row.title,
    body: row.body,
    link: row.link,
    createdAt: asStamp(row.created_at) ?? "",
    readAt: asStamp(row.read_at),
  };
}

/**
 * Generic in-site notification. Other features can call this without knowing
 * the marathon. `once` keeps invitation, day-open and registration notes single.
 */
export async function notifyUser(
  input: NotifyUserInput,
  getConnection: Conn = loadDefaultConnection,
): Promise<{ id: number; created: boolean }> {
  if (!Number.isInteger(input.userId) || input.userId <= 0) {
    return { id: 0, created: false };
  }
  const kind = clip(input.kind, 64);
  const title = clip(input.title, 255);
  const body = input.body.trim();
  if (!kind || !title || !body) return { id: 0, created: false };
  const link = input.link?.trim() ? clip(input.link, 512) : null;
  await ensureUserNotificationsSchema(getConnection);
  const connection = await getConnection();
  try {
    if (input.once) {
      const existing = await connection.query<{
        user_id: number;
        kind: string;
        link: string | null;
      }>(
        `SELECT user_id, kind, link
         FROM user_notifications
         WHERE user_id = ? AND kind = ? AND link <=> ?
         LIMIT 1`,
        [input.userId, kind, link],
      );
      if (
        !shouldInsertNotification(
          existing.map((row) => ({
            userId: Number(row.user_id),
            kind: row.kind,
            link: row.link,
          })),
          { userId: input.userId, kind, link, once: true },
        )
      ) {
        return { id: 0, created: false };
      }
    }
    const result = await connection.execute(
      `INSERT INTO user_notifications (user_id, kind, title, body, link)
       VALUES (?, ?, ?, ?, ?)`,
      [input.userId, kind, title, body, link],
    );
    return { id: result.insertId, created: true };
  } finally {
    connection.release();
  }
}

export async function listUserNotifications(
  userId: number,
  limit = 20,
  getConnection: Conn = loadDefaultConnection,
): Promise<UserNotification[]> {
  if (!Number.isInteger(userId) || userId <= 0) return [];
  const take = Math.min(50, Math.max(1, limit));
  await ensureUserNotificationsSchema(getConnection);
  const connection = await getConnection();
  try {
    const rows = await connection.query<Row>(
      `SELECT id, user_id, kind, title, body, link, created_at, read_at
       FROM user_notifications
       WHERE user_id = ?
       ORDER BY id DESC
       LIMIT ?`,
      [userId, take],
    );
    return rows.map(mapRow);
  } finally {
    connection.release();
  }
}

export async function countUnreadNotifications(
  userId: number,
  getConnection: Conn = loadDefaultConnection,
): Promise<number> {
  if (!Number.isInteger(userId) || userId <= 0) return 0;
  await ensureUserNotificationsSchema(getConnection);
  const connection = await getConnection();
  try {
    const rows = await connection.query<{ unread: number }>(
      `SELECT COUNT(*) AS unread
       FROM user_notifications
       WHERE user_id = ? AND read_at IS NULL`,
      [userId],
    );
    return Number(rows[0]?.unread) || 0;
  } finally {
    connection.release();
  }
}

export async function markNotificationRead(
  userId: number,
  id: number,
  getConnection: Conn = loadDefaultConnection,
): Promise<void> {
  if (!Number.isInteger(userId) || userId <= 0) return;
  if (!Number.isInteger(id) || id <= 0) return;
  await ensureUserNotificationsSchema(getConnection);
  const connection = await getConnection();
  try {
    await connection.execute(
      `UPDATE user_notifications
       SET read_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ? AND read_at IS NULL`,
      [id, userId],
    );
  } finally {
    connection.release();
  }
}

export async function markAllNotificationsRead(
  userId: number,
  getConnection: Conn = loadDefaultConnection,
): Promise<void> {
  if (!Number.isInteger(userId) || userId <= 0) return;
  await ensureUserNotificationsSchema(getConnection);
  const connection = await getConnection();
  try {
    await connection.execute(
      `UPDATE user_notifications
       SET read_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND read_at IS NULL`,
      [userId],
    );
  } finally {
    connection.release();
  }
}

export async function markNotificationsReadByLink(
  userId: number,
  link: string,
  getConnection: Conn = loadDefaultConnection,
): Promise<void> {
  const href = link.trim();
  if (!Number.isInteger(userId) || userId <= 0 || !href) return;
  await ensureUserNotificationsSchema(getConnection);
  const connection = await getConnection();
  try {
    await connection.execute(
      `UPDATE user_notifications
       SET read_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND link = ? AND read_at IS NULL`,
      [userId, href],
    );
  } finally {
    connection.release();
  }
}
