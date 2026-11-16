-- Promo codes grant free student access for N days and nothing else.
-- An optional teacher_id also links the redeeming student via teacher_students.
-- One redemption per user per code. Re-running does not duplicate the tables.
-- Case-insensitive uniqueness comes from utf8mb4_unicode_ci plus storing the
-- code in upper case. Take a database backup before applying on production.
-- Numbers 068–071 stay free. Next file after 075_parent_dashboard.sql.

CREATE TABLE IF NOT EXISTS promo_codes (
  id INT NOT NULL AUTO_INCREMENT,
  code VARCHAR(32) NOT NULL,
  teacher_id INT NULL DEFAULT NULL,
  access_days SMALLINT UNSIGNED NOT NULL,
  max_uses INT UNSIGNED NULL DEFAULT NULL,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_promo_codes_code (code),
  KEY idx_promo_codes_teacher (teacher_id),
  KEY idx_promo_codes_active (active, expires_at),
  CONSTRAINT fk_promo_codes_teacher
    FOREIGN KEY (teacher_id) REFERENCES app_users (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_promo_codes_creator
    FOREIGN KEY (created_by) REFERENCES app_users (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- access_until is the end of the free-access window granted by this redemption.
-- A later code extends from the later of "now" and the student's current window.
-- The unique pair stops a second redemption of the same code by the same user.
-- Deactivating a code does not delete redemptions already granted.

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id INT NOT NULL AUTO_INCREMENT,
  promo_code_id INT NOT NULL,
  user_id INT NOT NULL,
  access_until TIMESTAMP NOT NULL,
  redeemed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_promo_redemptions_code_user (promo_code_id, user_id),
  KEY idx_promo_redemptions_user (user_id, access_until),
  CONSTRAINT fk_promo_redemptions_code
    FOREIGN KEY (promo_code_id) REFERENCES promo_codes (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_promo_redemptions_user
    FOREIGN KEY (user_id) REFERENCES app_users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
