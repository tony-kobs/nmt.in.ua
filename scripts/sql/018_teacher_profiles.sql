-- Public teacher profile card («візитка») for /t/{slug}.
--
-- Numbering: latest `dev` ends at 016_task_sessions_expire_time.sql
-- (015 = user_avatars). Sibling open branches reserve 016 (consultations)
-- and 017 (teacher_students), so this script is 018 to avoid colliding
-- when those PRs land. The same CREATE TABLE is applied lazily by
-- src/modules/teachers/schema.ts.
-- Run once in phpMyAdmin or: mysql ... < scripts/sql/018_teacher_profiles.sql

-- Matches src/modules/teachers/schema.ts. Existing narrow tables are widened
-- by 025_teacher_profile_fields.sql (ADD COLUMN is a no-op once the column exists).
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
