-- Public teacher profile card («візитка») for /t/{slug}.
--
-- Numbering: latest `dev` ends at 016_task_sessions_expire_time.sql
-- (015 = user_avatars). Sibling open branches reserve 016 (consultations)
-- and 017 (teacher_students), so this script is 018 to avoid colliding
-- when those PRs land. The same CREATE TABLE is applied lazily by
-- src/modules/teachers/schema.ts.
-- Run once in phpMyAdmin or: mysql ... < scripts/sql/018_teacher_profiles.sql

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
