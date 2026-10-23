import "server-only";

import { randomBytes } from "node:crypto";
import type { SqlConnection } from "@/lib/db/mysql";
import { absoluteSiteUrl } from "@/lib/siteOrigin";
import { mysqlErrno } from "@/modules/teacher-students/mysqlErrno";
import { checkMarathonImage, INTRO_IMAGE_DAY_ID, marathonImagePath } from "./images";
import type { AvatarMime } from "@/modules/auth/avatarConstants";

type Conn = () => Promise<SqlConnection>;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

async function withConn<T>(
  fn: (connection: SqlConnection) => Promise<T>,
  getConnection: Conn = loadDefaultConnection,
): Promise<T> {
  const { ensureMarathonSchema } = await import("../schema");
  await ensureMarathonSchema(getConnection);
  const connection = await getConnection();
  try {
    return await fn(connection);
  } finally {
    connection.release();
  }
}

function tokenHex(value: unknown): string | null {
  const bytes = value instanceof Uint8Array ? value : null;
  if (!bytes || bytes.byteLength !== 16) return null;
  return Buffer.from(bytes).toString("hex");
}

export function imageHref(token: string | null | undefined): string | null {
  if (!token) return null;
  return marathonImagePath(token);
}

export async function saveMarathonImage(
  marathonId: number,
  dayId: number,
  bytes: Uint8Array,
  getConnection?: Conn,
): Promise<void> {
  const checked = checkMarathonImage(bytes);
  if (!checked.ok) throw new Error("marathon image rejected");
  const token = randomBytes(16);
  await withConn(async (connection) => {
    await connection.execute(
      `INSERT INTO marathon_images (marathon_id, day_id, mime, bytes, token)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         mime = VALUES(mime),
         bytes = VALUES(bytes),
         token = VALUES(token),
         updated_at = CURRENT_TIMESTAMP`,
      [marathonId, dayId, checked.mime, Buffer.from(bytes), token],
    );
  }, getConnection);
}

export async function deleteMarathonImage(
  marathonId: number,
  dayId: number,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `DELETE FROM marathon_images WHERE marathon_id = ? AND day_id = ?`,
      [marathonId, dayId],
    );
  }, getConnection);
}

export async function loadIntroImagePath(
  marathonId: number,
  getConnection?: Conn,
): Promise<string | null> {
  try {
    return await withConn(async (connection) => {
      const rows = await connection.query<{ token: unknown }>(
        `SELECT token FROM marathon_images WHERE marathon_id = ? AND day_id = ? LIMIT 1`,
        [marathonId, INTRO_IMAGE_DAY_ID],
      );
      return imageHref(tokenHex(rows[0]?.token));
    }, getConnection);
  } catch (error) {
    const errno = mysqlErrno(error);
    if (errno === 1146 || errno === 1054) return null;
    throw error;
  }
}

export async function introImageAbsoluteUrl(marathonId: number): Promise<string> {
  const path = await loadIntroImagePath(marathonId);
  return path ? absoluteSiteUrl(path) : "";
}

export type StoredMarathonImage = {
  mime: AvatarMime;
  bytes: Uint8Array;
};

export async function getMarathonImageByToken(
  token: string,
  getConnection?: Conn,
): Promise<StoredMarathonImage | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  try {
    return await withConn(async (connection) => {
      const rows = await connection.query<{ mime: string; bytes: Buffer | Uint8Array }>(
        `SELECT mime, bytes FROM marathon_images WHERE token = ? LIMIT 1`,
        [Buffer.from(token, "hex")],
      );
      const row = rows[0];
      if (!row) return null;
      const bytes = row.bytes instanceof Uint8Array ? row.bytes : new Uint8Array(row.bytes);
      const checked = checkMarathonImage(bytes);
      if (!checked.ok) return null;
      return { mime: checked.mime, bytes };
    }, getConnection);
  } catch (error) {
    const errno = mysqlErrno(error);
    if (errno === 1146 || errno === 1054) return null;
    throw error;
  }
}
