-- Shared riddle bank for marathon landings.
-- Take a database backup before applying this file on production.
--
-- Existing marathon_riddles rows are copied once (legacy_riddle_id) and tagged
-- to their marathon. They have no answer options, so the public page shows the
-- text only — the free-text answer stays in legacy_answer for the admin.
-- A riddle becomes a quiz when an admin saves 2–6 options with one correct.
-- landing_riddle_count is how many bank riddles the landing draws (default 3).
--
-- Idempotent: ADD COLUMN / CREATE / INSERT are safe to retry. errno 1060 and
-- 1062 are skipped by scripts/migrate.mjs; the INSERTs also guard themselves.

ALTER TABLE marathons
  ADD COLUMN landing_riddle_count TINYINT UNSIGNED NOT NULL DEFAULT 3 AFTER invite_audience;

CREATE TABLE IF NOT EXISTS riddle_bank (
  id INT NOT NULL AUTO_INCREMENT,
  legacy_riddle_id INT NULL,
  subject VARCHAR(64) NULL,
  visibility ENUM('shared', 'tagged') NOT NULL DEFAULT 'tagged',
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  hint TEXT NULL,
  legacy_answer VARCHAR(512) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_riddle_bank_legacy (legacy_riddle_id),
  KEY idx_riddle_bank_subject (subject, visibility)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS riddle_options (
  id INT NOT NULL AUTO_INCREMENT,
  riddle_id INT NOT NULL,
  sort_order TINYINT UNSIGNED NOT NULL,
  label VARCHAR(512) NOT NULL,
  is_correct TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_riddle_option_order (riddle_id, sort_order),
  KEY idx_riddle_option_riddle (riddle_id),
  CONSTRAINT fk_riddle_option_riddle FOREIGN KEY (riddle_id)
    REFERENCES riddle_bank (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS riddle_marathon_tags (
  riddle_id INT NOT NULL,
  marathon_id INT NOT NULL,
  PRIMARY KEY (riddle_id, marathon_id),
  KEY idx_riddle_tag_marathon (marathon_id),
  CONSTRAINT fk_riddle_tag_riddle FOREIGN KEY (riddle_id)
    REFERENCES riddle_bank (id) ON DELETE CASCADE,
  CONSTRAINT fk_riddle_tag_marathon FOREIGN KEY (marathon_id)
    REFERENCES marathons (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO riddle_bank (
  legacy_riddle_id, subject, visibility, title, body, hint, legacy_answer
)
SELECT r.id, NULLIF(m.subject, ''), 'tagged', r.title, r.body, r.hint, r.answer
FROM marathon_riddles r
INNER JOIN marathons m ON m.id = r.marathon_id
WHERE NOT EXISTS (
  SELECT 1 FROM riddle_bank b WHERE b.legacy_riddle_id = r.id
);

INSERT IGNORE INTO riddle_marathon_tags (riddle_id, marathon_id)
SELECT b.id, r.marathon_id
FROM riddle_bank b
INNER JOIN marathon_riddles r ON r.id = b.legacy_riddle_id;
