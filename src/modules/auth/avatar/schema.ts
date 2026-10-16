import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";
import { ensureSchemaOnce } from "@/lib/db/schemaGuard";

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

/** Creates `user_avatars` once per process if the migration is not recorded. */
export async function ensureAvatarSchema(
  getConnection: () => Promise<SqlConnection> = loadDefaultConnection,
): Promise<void> {
  await ensureSchemaOnce(
    "avatars",
    ["015_user_avatars.sql"],
    getConnection,
    async (connection) => {
      await connection.execute(SQL_CREATE_USER_AVATARS, []);
    },
  );
}
