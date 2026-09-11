-- Profile avatars for app_users (feat/account-avatar).
--
-- One row per user. The image lives in MySQL (MEDIUMBLOB) so it survives
-- hosting deploys that replace the www tree. This table is also created
-- lazily at runtime by src/modules/auth/avatar/schema.ts (same statement).
-- Run once in phpMyAdmin or: mysql ... < scripts/sql/014_user_avatars.sql

CREATE TABLE IF NOT EXISTS user_avatars (
  user_id INT NOT NULL,
  mime VARCHAR(32) NOT NULL,
  bytes MEDIUMBLOB NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
