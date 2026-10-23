-- Take a database backup before applying this on production.
-- Optional intro and day photos live in MySQL (a release directory is wiped on deploy).
-- day_id 0 is the intro. A positive day_id is marathon_days.id.
-- token is raw 16 bytes so the public lookup does not mix string collations.
-- photo_file_id remembers a Telegram photo on a /all draft.

CREATE TABLE IF NOT EXISTS marathon_images (
  marathon_id INT NOT NULL,
  day_id INT NOT NULL DEFAULT 0,
  mime VARCHAR(32) NOT NULL,
  bytes MEDIUMBLOB NOT NULL,
  token BINARY(16) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (marathon_id, day_id),
  UNIQUE KEY uq_marathon_images_token (token),
  CONSTRAINT fk_marathon_images_marathon FOREIGN KEY (marathon_id)
    REFERENCES marathons (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE marathon_team_broadcasts
  ADD COLUMN photo_file_id VARCHAR(128) NULL AFTER body;
