import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";

export const SQL_CREATE_USER_AVATARS = `
  CREATE TABLE IF NOT EXISTS user_avatars (
    user_id INT NOT NULL,
    mime VARCHAR(32) NOT NULL,
    bytes MEDIUMBLOB NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

let schemaReady: Promise<void> | undefined;

async function runAvatarSchemaMigration(
  getConnection: () => Promise<SqlConnection>,
): Promise<void> {
  const connection = await getConnection();
  try {
    await connection.execute(SQL_CREATE_USER_AVATARS, []);
  } finally {
    connection.release();
  }
}

/** Creates `user_avatars` once per process if the table is missing. */
export async function ensureAvatarSchema(
  getConnection: () => Promise<SqlConnection> = loadDefaultConnection,
): Promise<void> {
  if (!schemaReady) {
    schemaReady = runAvatarSchemaMigration(getConnection).catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  await schemaReady;
}
