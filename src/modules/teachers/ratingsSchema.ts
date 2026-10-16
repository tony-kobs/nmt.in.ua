import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";
import { ensureSchemaOnce } from "@/lib/db/schemaGuard";

export const SQL_CREATE_TEACHER_RATINGS = `
  CREATE TABLE IF NOT EXISTS teacher_ratings (
    teacher_user_id INT NOT NULL,
    student_user_id INT NOT NULL,
    score TINYINT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (teacher_user_id, student_user_id),
    KEY idx_teacher_ratings_teacher (teacher_user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/** Creates `teacher_ratings` once per process if the migration is not recorded. */
export async function ensureTeacherRatingsSchema(
  getConnection: () => Promise<SqlConnection> = loadDefaultConnection,
): Promise<void> {
  await ensureSchemaOnce(
    "teacher_ratings",
    ["032_teacher_ratings.sql"],
    getConnection,
    async (connection) => {
      await connection.execute(SQL_CREATE_TEACHER_RATINGS, []);
    },
  );
}
