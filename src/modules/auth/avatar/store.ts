import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import type { AvatarMime } from "../avatarConstants";
import { sniffAvatarMime } from "../avatarConstants";
import { ensureAvatarSchema } from "./schema";

export type StoredAvatar = {
  mime: AvatarMime;
  bytes: Uint8Array;
  updatedAtSec: number;
};

type AvatarRow = {
  mime: string;
  bytes: Buffer | Uint8Array;
  updated_at_sec: number | string;
};

type RevRow = { avatar_rev: number | string };

const SQL_GET = `
  SELECT mime, bytes, UNIX_TIMESTAMP(updated_at) AS updated_at_sec
  FROM user_avatars
  WHERE user_id = ?
  LIMIT 1
`;

const SQL_UPSERT = `
  INSERT INTO user_avatars (user_id, mime, bytes)
  VALUES (?, ?, ?)
  ON DUPLICATE KEY UPDATE
    mime = VALUES(mime),
    bytes = VALUES(bytes),
    updated_at = CURRENT_TIMESTAMP
`;

const SQL_DELETE = `DELETE FROM user_avatars WHERE user_id = ?`;

const SQL_REV = `
  SELECT UNIX_TIMESTAMP(updated_at) AS avatar_rev
  FROM user_avatars
  WHERE user_id = ?
  LIMIT 1
`;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

type AvatarDeps = {
  getConnection: () => Promise<SqlConnection>;
};

function asPositiveInt(value: unknown): number | null {
  const numeric = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  return numeric;
}

function toBytes(value: Buffer | Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

export async function getStoredAvatar(
  userId: number,
  deps: AvatarDeps = { getConnection: loadDefaultConnection },
): Promise<StoredAvatar | null> {
  await ensureAvatarSchema(deps.getConnection);
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<AvatarRow>(SQL_GET, [userId]);
    const row = rows[0];
    if (!row) return null;
    const bytes = toBytes(row.bytes);
    const mime = sniffAvatarMime(bytes);
    if (!mime) return null;
    const updatedAtSec = asPositiveInt(row.updated_at_sec);
    if (!updatedAtSec) return null;
    return { mime, bytes, updatedAtSec };
  } finally {
    connection.release();
  }
}

export async function upsertStoredAvatar(
  input: { userId: number; mime: AvatarMime; bytes: Uint8Array },
  deps: AvatarDeps = { getConnection: loadDefaultConnection },
): Promise<number> {
  await ensureAvatarSchema(deps.getConnection);
  const connection = await deps.getConnection();
  try {
    await connection.execute(SQL_UPSERT, [
      input.userId,
      input.mime,
      Buffer.from(input.bytes),
    ]);
    const rows = await connection.query<RevRow>(SQL_REV, [input.userId]);
    const rev = asPositiveInt(rows[0]?.avatar_rev);
    if (!rev) {
      throw new Error("Avatar write did not return a revision.");
    }
    return rev;
  } finally {
    connection.release();
  }
}

export async function deleteStoredAvatar(
  userId: number,
  deps: AvatarDeps = { getConnection: loadDefaultConnection },
): Promise<void> {
  await ensureAvatarSchema(deps.getConnection);
  const connection = await deps.getConnection();
  try {
    await connection.execute(SQL_DELETE, [userId]);
  } finally {
    connection.release();
  }
}
