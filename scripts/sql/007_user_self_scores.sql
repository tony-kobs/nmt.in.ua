-- Self-assessment history (feat/diagnostic-self-score).
--
-- One row per self-assessment, never overwritten, so history is preserved:
--   - source = 'diagnostic_overall', theme_id = NULL: "Як я знаю математику"
--     answered once before the public diagnostic test.
--   - source = 'pre_topic', theme_id = <theme>: answered before every
--     normal topic test for that theme.
-- Exactly one of user_id / guest_token is set (guest rows get claimed onto
-- a user_id — and guest_token cleared — at registration, see
-- src/modules/diagnostic/claimGuestProgress.ts).
--
-- This table is also created lazily at runtime by
-- src/modules/self-score/schema.ts::ensureSelfScoreSchema (same statement),
-- mirroring src/modules/feedback/schema.ts. This file documents it for
-- manual/staging setup and matches the repo's numbered-SQL convention.
-- Run once in phpMyAdmin or: mysql ... < scripts/sql/007_user_self_scores.sql

CREATE TABLE IF NOT EXISTS user_self_scores (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NULL,
  guest_token CHAR(36) NULL,
  theme_id INT NULL,
  score TINYINT NOT NULL,
  source ENUM('diagnostic_overall', 'pre_topic') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user_self_scores_user (user_id, theme_id, created_at),
  KEY idx_user_self_scores_guest (guest_token, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
