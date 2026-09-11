import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";

export const SQL_CREATE_TEACHER_STUDENTS = `
  CREATE TABLE IF NOT EXISTS teacher_students (
    teacher_user_id INT NOT NULL,
    student_user_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (teacher_user_id, student_user_id),
    KEY idx_teacher_students_student (student_user_id),
    CONSTRAINT fk_teacher_students_teacher
      FOREIGN KEY (teacher_user_id) REFERENCES app_users (id)
      ON DELETE CASCADE,
    CONSTRAINT fk_teacher_students_student
      FOREIGN KEY (student_user_id) REFERENCES app_users (id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

let schemaReady: Promise<void> | undefined;

async function runTeacherStudentsSchemaMigration(
  getConnection: () => Promise<SqlConnection>,
): Promise<void> {
  const connection = await getConnection();
  try {
    await connection.execute(SQL_CREATE_TEACHER_STUDENTS, []);
  } finally {
    connection.release();
  }
}

/** Creates `teacher_students` once per process if the table is missing. */
export async function ensureTeacherStudentsSchema(
  getConnection: () => Promise<SqlConnection> = loadDefaultConnection,
): Promise<void> {
  if (!schemaReady) {
    schemaReady = runTeacherStudentsSchemaMigration(getConnection).catch(
      (error) => {
        schemaReady = undefined;
        throw error;
      },
    );
  }
  await schemaReady;
}

export async function loadTeacherStudentsConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}
