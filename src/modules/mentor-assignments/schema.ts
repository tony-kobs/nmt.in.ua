import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";
import { ensureSchemaOnce } from "@/lib/db/schemaGuard";

export const SQL_CREATE_MENTOR_ASSIGNMENTS = `
  CREATE TABLE IF NOT EXISTS mentor_assignments (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    teacher_user_id INT NOT NULL,
    theme_id INT NOT NULL,
    difficulty INT UNSIGNED NOT NULL DEFAULT 1,
    tasks_number INT UNSIGNED NOT NULL DEFAULT 10,
    available_at INT UNSIGNED NOT NULL,
    due_at INT UNSIGNED NOT NULL,
    schedule_mode ENUM('now', 'datetime') NOT NULL DEFAULT 'now',
    status ENUM('active', 'cancelled') NOT NULL DEFAULT 'active',
    created_at INT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    KEY idx_mentor_assignments_teacher_status (teacher_user_id, status),
    KEY idx_mentor_assignments_theme (theme_id),
    CONSTRAINT fk_mentor_assignments_teacher
      FOREIGN KEY (teacher_user_id) REFERENCES app_users (id)
      ON DELETE CASCADE,
    CONSTRAINT fk_mentor_assignments_theme
      FOREIGN KEY (theme_id) REFERENCES themes (id)
      ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export const SQL_CREATE_MENTOR_ASSIGNMENT_MEMBERS = `
  CREATE TABLE IF NOT EXISTS mentor_assignment_members (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    assignment_id INT UNSIGNED NOT NULL,
    student_user_id INT NOT NULL,
    session_id INT UNSIGNED NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_mentor_assignment_member (assignment_id, student_user_id),
    KEY idx_mentor_assignment_members_student (student_user_id),
    KEY idx_mentor_assignment_members_session (session_id),
    CONSTRAINT fk_mentor_assignment_members_assignment
      FOREIGN KEY (assignment_id) REFERENCES mentor_assignments (id)
      ON DELETE CASCADE,
    CONSTRAINT fk_mentor_assignment_members_student
      FOREIGN KEY (student_user_id) REFERENCES app_users (id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

async function columnNames(connection: SqlConnection): Promise<Set<string>> {
  const rows = await connection.query<{
    COLUMN_NAME?: string;
    column_name?: string;
  }>(
    `SELECT COLUMN_NAME AS COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mentor_assignments'`,
    []
  );
  return new Set(
    rows.map((row) => String(row.COLUMN_NAME ?? row.column_name ?? ""))
  );
}

/** Add available_at when the table was created before that column existed. */
export async function migrateMentorAssignmentsAvailableAt(
  connection: SqlConnection
): Promise<void> {
  const columns = await columnNames(connection);
  if (columns.size === 0 || columns.has("available_at")) return;

  await connection.execute(
    `ALTER TABLE mentor_assignments
     ADD COLUMN available_at INT UNSIGNED NOT NULL DEFAULT 0 AFTER tasks_number`,
    []
  );
  await connection.execute(
    `UPDATE mentor_assignments
     SET available_at = created_at
     WHERE available_at = 0`,
    []
  );
}

export async function migrateMentorAssignmentsDifficulty(
  connection: SqlConnection
): Promise<void> {
  const columns = await columnNames(connection);
  if (columns.size === 0 || columns.has("difficulty")) return;

  await connection.execute(
    `ALTER TABLE mentor_assignments
     ADD COLUMN difficulty INT UNSIGNED NOT NULL DEFAULT 1 AFTER theme_id`,
    []
  );
}

/** Creates assignment tables once per process if the migration is not recorded. */
export async function ensureMentorAssignmentsSchema(
  getConnection: () => Promise<SqlConnection> = loadDefaultConnection,
): Promise<void> {
  await ensureSchemaOnce(
    "mentor_assignments",
    ["033_mentor_assignments.sql"],
    getConnection,
    async (connection) => {
      await connection.execute(SQL_CREATE_MENTOR_ASSIGNMENTS, []);
      await migrateMentorAssignmentsAvailableAt(connection);
      await migrateMentorAssignmentsDifficulty(connection);
      await connection.execute(SQL_CREATE_MENTOR_ASSIGNMENT_MEMBERS, []);
    },
  );
}

export async function loadMentorAssignmentsConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}
