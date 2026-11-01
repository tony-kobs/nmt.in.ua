import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";
import { ensureSchemaOnce } from "@/lib/db/schemaGuard";

export const SQL_CREATE_SESSIONS = `
  CREATE TABLE IF NOT EXISTS sessions (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    teacher_user_id INT NOT NULL,
    title VARCHAR(160) NOT NULL,
    theme_id INT NOT NULL,
    difficulty INT UNSIGNED NOT NULL DEFAULT 1,
    origin ENUM('manual', 'quick', 'migrated') NOT NULL DEFAULT 'manual',
    legacy_assignment_id INT UNSIGNED NULL DEFAULT NULL,
    created_at INT UNSIGNED NOT NULL,
    updated_at INT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sessions_legacy_assignment (legacy_assignment_id),
    KEY idx_sessions_teacher (teacher_user_id, updated_at),
    KEY idx_sessions_theme (theme_id),
    CONSTRAINT fk_sessions_teacher
      FOREIGN KEY (teacher_user_id) REFERENCES app_users (id)
      ON DELETE CASCADE,
    CONSTRAINT fk_sessions_theme
      FOREIGN KEY (theme_id) REFERENCES themes (id)
      ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export const SQL_CREATE_SESSION_TASKS = `
  CREATE TABLE IF NOT EXISTS session_tasks (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    session_id INT UNSIGNED NOT NULL,
    quiz_task_id INT NOT NULL,
    position INT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_session_tasks_order (session_id, position),
    UNIQUE KEY uq_session_tasks_task (session_id, quiz_task_id),
    KEY idx_session_tasks_quiz (quiz_task_id),
    CONSTRAINT fk_session_tasks_session
      FOREIGN KEY (session_id) REFERENCES sessions (id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

async function columnExists(
  connection: SqlConnection,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = await connection.query<{ COLUMN_NAME?: string }>(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return rows.length > 0;
}

async function indexExists(
  connection: SqlConnection,
  table: string,
  index: string,
): Promise<boolean> {
  const rows = await connection.query<{ INDEX_NAME?: string }>(
    `SELECT INDEX_NAME
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
     LIMIT 1`,
    [table, index],
  );
  return rows.length > 0;
}

async function constraintExists(
  connection: SqlConnection,
  table: string,
  name: string,
): Promise<boolean> {
  const rows = await connection.query<{ CONSTRAINT_NAME?: string }>(
    `SELECT CONSTRAINT_NAME
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?
     LIMIT 1`,
    [table, name],
  );
  return rows.length > 0;
}

/**
 * Tables and the assignment link. The data backfill lives only in
 * `062_teacher_learning_sessions.sql` so it runs inside `npm run migrate`
 * after a backup, not on the first page view.
 */
export async function ensureTeacherSessionsSchema(
  getConnection: () => Promise<SqlConnection> = loadDefaultConnection,
): Promise<void> {
  await ensureSchemaOnce(
    "teacher_sessions",
    ["062_teacher_learning_sessions.sql"],
    getConnection,
    async (connection) => {
      await connection.execute(SQL_CREATE_SESSIONS, []);
      await connection.execute(SQL_CREATE_SESSION_TASKS, []);
      if (!(await columnExists(connection, "sessions", "legacy_assignment_id"))) {
        await connection.execute(
          `ALTER TABLE sessions
           ADD COLUMN legacy_assignment_id INT UNSIGNED NULL DEFAULT NULL`,
          [],
        );
      }
      if (!(await indexExists(connection, "sessions", "uq_sessions_legacy_assignment"))) {
        await connection.execute(
          `ALTER TABLE sessions
           ADD UNIQUE KEY uq_sessions_legacy_assignment (legacy_assignment_id)`,
          [],
        );
      }

      if (!(await columnExists(connection, "mentor_assignments", "difficulty"))) {
        await connection.execute(
          `ALTER TABLE mentor_assignments
           ADD COLUMN difficulty INT UNSIGNED NOT NULL DEFAULT 1`,
          [],
        );
      }
      if (!(await columnExists(connection, "mentor_assignments", "session_id"))) {
        await connection.execute(
          `ALTER TABLE mentor_assignments
           ADD COLUMN session_id INT UNSIGNED NULL DEFAULT NULL`,
          [],
        );
      }
      if (
        !(await indexExists(
          connection,
          "mentor_assignments",
          "idx_mentor_assignments_learning_session",
        ))
      ) {
        await connection.execute(
          `ALTER TABLE mentor_assignments
           ADD KEY idx_mentor_assignments_learning_session (session_id)`,
          [],
        );
      }
      if (
        !(await constraintExists(
          connection,
          "mentor_assignments",
          "fk_mentor_assignments_learning_session",
        ))
      ) {
        await connection.execute(
          `ALTER TABLE mentor_assignments
           ADD CONSTRAINT fk_mentor_assignments_learning_session
             FOREIGN KEY (session_id) REFERENCES sessions (id)
             ON DELETE RESTRICT`,
          [],
        );
      }
    },
  );
}
