import "server-only";

import type { UserRole } from "@/modules/auth/types";
import type { SqlConnection } from "@/lib/db/mysql";
import { presentBellNotifications } from "./bell";
import {
  listUserNotifications,
  markNotificationsReadByIds,
  type UserNotification,
} from "./store";

type Conn = () => Promise<SqlConnection>;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

function errnoOf(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("errno" in error)) return null;
  const errno = Number((error as { errno?: unknown }).errno);
  return Number.isInteger(errno) ? errno : null;
}

async function answeredMarathonSlugs(
  userId: number,
  getConnection: Conn,
): Promise<{ joined: Set<string>; declined: Set<string> }> {
  const joined = new Set<string>();
  const declined = new Set<string>();
  const connection = await getConnection();
  try {
    try {
      const rows = await connection.query<{ slug: string }>(
        `SELECT m.slug
         FROM marathon_participants p
         INNER JOIN marathons m ON m.id = p.marathon_id
         WHERE p.user_id = ?`,
        [userId],
      );
      for (const row of rows) {
        const slug = row.slug?.trim();
        if (slug) joined.add(slug);
      }
    } catch (error) {
      if (errnoOf(error) !== 1146) throw error;
    }
    try {
      const rows = await connection.query<{ slug: string }>(
        `SELECT m.slug
         FROM marathon_declines d
         INNER JOIN marathons m ON m.id = d.marathon_id
         WHERE d.user_id = ?`,
        [userId],
      );
      for (const row of rows) {
        const slug = row.slug?.trim();
        if (slug) declined.add(slug);
      }
    } catch (error) {
      if (errnoOf(error) !== 1146) throw error;
    }
  } finally {
    connection.release();
  }
  return { joined, declined };
}

export async function loadBellNotifications(
  userId: number,
  role: UserRole,
  getConnection: Conn = loadDefaultConnection,
): Promise<UserNotification[]> {
  const items = await listUserNotifications(userId, 30, getConnection);
  const { joined, declined } = await answeredMarathonSlugs(userId, getConnection);
  const presented = presentBellNotifications({
    items,
    role,
    joinedSlugs: joined,
    declinedSlugs: declined,
  });
  if (presented.dismissIds.length > 0) {
    await markNotificationsReadByIds(userId, presented.dismissIds, getConnection);
  }
  return presented.visible;
}
