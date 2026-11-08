-- Marker for the printable workbook in `problems`.
-- Deploy creates this empty table and does not insert tasks.
-- `/problems` keeps reading src/content/workbookProblems.json until the
-- catalog hash is stored here. Load it after a database backup:
--   node scripts/import-workbook.mjs
--   node scripts/import-workbook.mjs --apply
-- The script is not part of deploy. `problems.theme_id` stays the zadachnyk
-- topic id, not themes.id. A second --apply writes the same rows again.

CREATE TABLE IF NOT EXISTS workbook_catalog (
  id TINYINT NOT NULL,
  revision CHAR(64) NOT NULL,
  problem_count INT NOT NULL,
  loaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
