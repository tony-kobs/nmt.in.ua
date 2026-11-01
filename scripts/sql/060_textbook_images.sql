-- Take a database backup before applying this on production.
-- Figures dropped into /admin/textbook. A release directory is wiped on deploy,
-- so the bytes live in MySQL (same reason as marathon_images).
-- content_hash is the SHA-256 of the file: identical bytes are stored once,
-- the same idea as 058_nmt_image_dedupe.sql for files under /nmt/osvita/.

CREATE TABLE IF NOT EXISTS textbook_images (
  content_hash CHAR(64) NOT NULL,
  mime VARCHAR(32) NOT NULL,
  bytes MEDIUMBLOB NOT NULL,
  byte_length INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (content_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
