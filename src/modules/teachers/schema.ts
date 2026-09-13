import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";

export const SQL_CREATE_TEACHER_PROFILES = `
  CREATE TABLE IF NOT EXISTS teacher_profiles (
    user_id INT NOT NULL,
    slug VARCHAR(48) NOT NULL,
    headline VARCHAR(160) NULL,
    bio TEXT NULL,
    city VARCHAR(80) NULL,
    subjects VARCHAR(512) NULL,
    contact_url VARCHAR(500) NULL,
    is_public TINYINT(1) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    UNIQUE KEY uq_teacher_profiles_slug (slug)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

let schemaReady: Promise<void> | undefined;

async function runTeacherProfileSchemaMigration(
  getConnection: () => Promise<SqlConnection>,
): Promise<void> {
  const connection = await getConnection();
  try {
    await connection.execute(SQL_CREATE_TEACHER_PROFILES, []);
  } finally {
    connection.release();
  }
}

/** Creates `teacher_profiles` once per process if the table is missing. */
export async function ensureTeacherProfileSchema(
  getConnection: () => Promise<SqlConnection> = loadDefaultConnection,
): Promise<void> {
  if (!schemaReady) {
    schemaReady = runTeacherProfileSchemaMigration(getConnection).catch(
      (error) => {
        schemaReady = undefined;
        throw error;
      },
    );
  }
  await schemaReady;
}
