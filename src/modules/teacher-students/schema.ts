import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";
import { ensureSchemaOnce } from "@/lib/db/schemaGuard";

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

/** Same statements as scripts/sql/034_student_groups_invites.sql. */
export const SQL_CREATE_STUDENT_GROUPS = `
  CREATE TABLE IF NOT EXISTS student_groups (
    id INT NOT NULL AUTO_INCREMENT,
    teacher_user_id INT NOT NULL,
    name VARCHAR(80) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_student_groups_teacher_name (teacher_user_id, name),
    UNIQUE KEY uq_student_groups_id_teacher (id, teacher_user_id),
    CONSTRAINT fk_student_groups_teacher
      FOREIGN KEY (teacher_user_id) REFERENCES app_users (id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export const SQL_CREATE_STUDENT_GROUP_MEMBERS = `
  CREATE TABLE IF NOT EXISTS student_group_members (
    teacher_user_id INT NOT NULL,
    student_user_id INT NOT NULL,
    group_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (teacher_user_id, student_user_id),
    KEY idx_student_group_members_group (group_id),
    CONSTRAINT fk_student_group_members_roster
      FOREIGN KEY (teacher_user_id, student_user_id)
      REFERENCES teacher_students (teacher_user_id, student_user_id)
      ON DELETE CASCADE,
    CONSTRAINT fk_student_group_members_group
      FOREIGN KEY (group_id, teacher_user_id)
      REFERENCES student_groups (id, teacher_user_id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export const SQL_CREATE_STUDENT_INVITES = `
  CREATE TABLE IF NOT EXISTS student_invites (
    id INT NOT NULL AUTO_INCREMENT,
    teacher_user_id INT NOT NULL,
    kind ENUM('personal', 'group') NOT NULL,
    group_id INT NULL,
    code VARCHAR(16) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_student_invites_code (code),
    KEY idx_student_invites_teacher (teacher_user_id, kind, revoked_at),
    KEY idx_student_invites_group (group_id),
    CONSTRAINT fk_student_invites_teacher
      FOREIGN KEY (teacher_user_id) REFERENCES app_users (id)
      ON DELETE CASCADE,
    CONSTRAINT fk_student_invites_group
      FOREIGN KEY (group_id) REFERENCES student_groups (id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/** Creates roster tables once per process if the migrations are not recorded. */
export async function ensureTeacherStudentsSchema(
  getConnection: () => Promise<SqlConnection> = loadDefaultConnection,
): Promise<void> {
  await ensureSchemaOnce(
    "teacher_students",
    ["017_teacher_students.sql", "034_student_groups_invites.sql"],
    getConnection,
    async (connection) => {
      await connection.execute(SQL_CREATE_TEACHER_STUDENTS, []);
      await connection.execute(SQL_CREATE_STUDENT_GROUPS, []);
      await connection.execute(SQL_CREATE_STUDENT_GROUP_MEMBERS, []);
      await connection.execute(SQL_CREATE_STUDENT_INVITES, []);
    },
  );
}

export async function loadTeacherStudentsConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}
