import "server-only";

import { createHash } from "node:crypto";
import type { SqlConnection } from "@/lib/db/mysql";
import { mysqlErrno } from "@/modules/teacher-students/mysqlErrno";
import { checkTextbookImage, textbookImagePath, type TextbookImageMime } from "./imageLimits";
import { ensureTextbookImageSchema } from "./schema";

type Conn = () => Promise<SqlConnection>;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

export function hashTextbookImage(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export type StoredTextbookImage = {
  mime: TextbookImageMime;
  bytes: Uint8Array;
};

async function withImageConn<T>(
  fn: (connection: SqlConnection) => Promise<T>,
  getConnection: Conn,
): Promise<T> {
  await ensureTextbookImageSchema(getConnection);
  const connection = await getConnection();
  try {
    return await fn(connection);
  } finally {
    connection.release();
  }
}

export async function saveTextbookImage(
  bytes: Uint8Array,
  getConnection: Conn = loadDefaultConnection,
): Promise<{ ok: true; src: string } | { ok: false; code: "type" | "size" }> {
  const checked = checkTextbookImage(bytes);
  if (!checked.ok) return checked;
  const hash = hashTextbookImage(bytes);
  const src = textbookImagePath(hash);
  if (!src) return { ok: false, code: "type" };
  await withImageConn(async (connection) => {
    const existing = await connection.query<{ content_hash: string }>(
      `SELECT content_hash FROM textbook_images WHERE content_hash = ? LIMIT 1`,
      [hash],
    );
    if (existing[0]) return;
    try {
      await connection.execute(
        `INSERT INTO textbook_images (content_hash, mime, bytes, byte_length)
         VALUES (?, ?, ?, ?)`,
        [hash, checked.mime, Buffer.from(bytes), bytes.byteLength],
      );
    } catch (error) {
      if (mysqlErrno(error) === 1062) return;
      throw error;
    }
  }, getConnection);
  return { ok: true, src };
}

export async function getTextbookImage(
  hash: string,
  getConnection: Conn = loadDefaultConnection,
): Promise<StoredTextbookImage | null> {
  if (!textbookImagePath(hash)) return null;
  try {
    return await withImageConn(async (connection) => {
      const rows = await connection.query<{ mime: string; bytes: Buffer | Uint8Array }>(
        `SELECT mime, bytes FROM textbook_images WHERE content_hash = ? LIMIT 1`,
        [hash],
      );
      const row = rows[0];
      if (!row) return null;
      const bytes = row.bytes instanceof Uint8Array ? row.bytes : new Uint8Array(row.bytes);
      const checked = checkTextbookImage(bytes);
      if (!checked.ok) return null;
      return { mime: checked.mime, bytes };
    }, getConnection);
  } catch (error) {
    const errno = mysqlErrno(error);
    if (errno === 1146 || errno === 1054) return null;
    throw error;
  }
}
