-- Old reply-keyboard labels for marathon buttons.
-- Take a database backup before applying this on production.
--
-- The bottom menu sends the label text, not a callback id. When an admin
-- renames a button, keyboards already on phones still send the previous
-- word. This table keeps those words so they still open the same action.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS. scripts/migrate.mjs skips errno 1050.

CREATE TABLE IF NOT EXISTS marathon_button_labels (
  marathon_id INT NOT NULL,
  callback_data VARCHAR(32) NOT NULL,
  label VARCHAR(64) NOT NULL,
  PRIMARY KEY (marathon_id, callback_data, label),
  CONSTRAINT fk_marathon_button_labels FOREIGN KEY (marathon_id)
    REFERENCES marathons (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
