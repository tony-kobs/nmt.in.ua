-- Take a database backup before applying this on production.
-- Each Publish in /admin/textbook stores a snapshot here. The live draft
-- stays in textbook_sections.body. draft_revision is the optimistic token:
-- a second tab must not overwrite a newer draft.

ALTER TABLE textbook_sections
  ADD COLUMN draft_revision INT UNSIGNED NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS textbook_section_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  theme_code VARCHAR(32) NOT NULL,
  body MEDIUMTEXT NOT NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_textbook_section_versions_theme (theme_code, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
