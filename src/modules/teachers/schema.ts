import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";
import { ensureSchemaOnce } from "@/lib/db/schemaGuard";

export const SQL_CREATE_TEACHER_PROFILES = `
  CREATE TABLE IF NOT EXISTS teacher_profiles (
    user_id INT NOT NULL,
    slug VARCHAR(48) NOT NULL,
    headline VARCHAR(160) NULL,
    bio TEXT NULL,
    experience VARCHAR(160) NULL,
    publications TEXT NULL,
    city VARCHAR(80) NULL,
    country VARCHAR(80) NULL,
    subjects VARCHAR(512) NULL,
    teaching_levels VARCHAR(512) NULL,
    teaching_languages VARCHAR(512) NULL,
    contact_url VARCHAR(500) NULL,
    phone VARCHAR(32) NULL,
    lesson_price DECIMAL(12,2) NULL,
    lesson_currency CHAR(3) NULL,
    lesson_duration_minutes SMALLINT UNSIGNED NULL,
    join_motivation TEXT NULL,
    moderation_status ENUM('draft', 'pending', 'approved', 'rejected')
      NOT NULL DEFAULT 'draft',
    submitted_at TIMESTAMP NULL DEFAULT NULL,
    reviewed_at TIMESTAMP NULL DEFAULT NULL,
    reviewed_by INT NULL,
    rejection_reason VARCHAR(1000) NULL,
    is_public TINYINT(1) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    UNIQUE KEY uq_teacher_profiles_slug (slug),
    KEY idx_teacher_profiles_public (is_public),
    KEY idx_teacher_profiles_moderation_status (moderation_status)
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
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'teacher_profiles'`,
    [],
  );
  return new Set(
    rows.map((row) => String(row.COLUMN_NAME ?? row.column_name ?? "")),
  );
}

/** Add missing teacher profile fields when an older version of the table exists. */
export async function migrateTeacherProfileFields(
  connection: SqlConnection,
): Promise<void> {
  const columns = await columnNames(connection);
  if (columns.size === 0) return;

  if (!columns.has("experience")) {
    await connection.execute(
      `ALTER TABLE teacher_profiles
       ADD COLUMN experience VARCHAR(160) NULL AFTER bio`,
      [],
    );
  }
  if (!columns.has("publications")) {
    await connection.execute(
      `ALTER TABLE teacher_profiles
       ADD COLUMN publications TEXT NULL AFTER experience`,
      [],
    );
  }
  if (!columns.has("country")) {
    await connection.execute(
      `ALTER TABLE teacher_profiles
       ADD COLUMN country VARCHAR(80) NULL AFTER city`,
      [],
    );
  }

  if (!columns.has("teaching_levels")) {
    await connection.execute(
      `ALTER TABLE teacher_profiles
       ADD COLUMN teaching_levels VARCHAR(512) NULL AFTER subjects`,
      [],
    );
  }

  if (!columns.has("teaching_languages")) {
    await connection.execute(
      `ALTER TABLE teacher_profiles
       ADD COLUMN teaching_languages VARCHAR(512) NULL AFTER teaching_levels`,
      [],
    );
  }

  if (!columns.has("phone")) {
    await connection.execute(
      `ALTER TABLE teacher_profiles
       ADD COLUMN phone VARCHAR(32) NULL AFTER contact_url`,
      [],
    );
  }

  if (!columns.has("lesson_price")) {
    await connection.execute(
      `ALTER TABLE teacher_profiles
       ADD COLUMN lesson_price DECIMAL(12,2) NULL AFTER teaching_languages`,
      [],
    );
  }

  if (!columns.has("lesson_currency")) {
    await connection.execute(
      `ALTER TABLE teacher_profiles
       ADD COLUMN lesson_currency CHAR(3) NULL AFTER lesson_price`,
      [],
    );
  }

  if (!columns.has("lesson_duration_minutes")) {
    await connection.execute(
      `ALTER TABLE teacher_profiles
       ADD COLUMN lesson_duration_minutes SMALLINT UNSIGNED NULL AFTER lesson_currency`,
      [],
    );
  }

  if (!columns.has("join_motivation")) {
    await connection.execute(
      `ALTER TABLE teacher_profiles
       ADD COLUMN join_motivation TEXT NULL AFTER lesson_duration_minutes`,
      [],
    );
  }

  if (!columns.has("moderation_status")) {
    await connection.execute(
      `ALTER TABLE teacher_profiles
     ADD COLUMN moderation_status
     ENUM('draft', 'pending', 'approved', 'rejected')
     NOT NULL DEFAULT 'draft' AFTER join_motivation,
     ADD KEY idx_teacher_profiles_moderation_status (moderation_status)`,
      [],
    );

    await connection.execute(
      `UPDATE teacher_profiles
       SET moderation_status = 'approved'
       WHERE is_public = 1`,
      [],
    );
  }

  if (!columns.has("submitted_at")) {
    await connection.execute(
      `ALTER TABLE teacher_profiles
       ADD COLUMN submitted_at TIMESTAMP NULL DEFAULT NULL AFTER moderation_status`,
      [],
    );
  }

  if (!columns.has("reviewed_at")) {
    await connection.execute(
      `ALTER TABLE teacher_profiles
       ADD COLUMN reviewed_at TIMESTAMP NULL DEFAULT NULL AFTER submitted_at`,
      [],
    );
  }

  if (!columns.has("reviewed_by")) {
    await connection.execute(
      `ALTER TABLE teacher_profiles
       ADD COLUMN reviewed_by INT NULL AFTER reviewed_at`,
      [],
    );
  }

  if (!columns.has("rejection_reason")) {
    await connection.execute(
      `ALTER TABLE teacher_profiles
       ADD COLUMN rejection_reason VARCHAR(1000) NULL AFTER reviewed_by`,
      [],
    );
  }
}

/** Creates `teacher_profiles` once per process if the migration is not recorded. */
export async function ensureTeacherProfileSchema(
  getConnection: () => Promise<SqlConnection> = loadDefaultConnection,
): Promise<void> {
  await ensureSchemaOnce(
    "teacher_profiles",
    ["018_teacher_profiles.sql", "025_teacher_profile_fields.sql"],
    getConnection,
    async (connection) => {
      await connection.execute(SQL_CREATE_TEACHER_PROFILES, []);
      await migrateTeacherProfileFields(connection);
    },
  );
}
