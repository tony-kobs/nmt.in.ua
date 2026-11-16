import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { ensureSchemaOnce } from "@/lib/db/schemaGuard";

export const PROMO_MIGRATION = "076_promo_codes.sql";

/** Same statements as scripts/sql/076_promo_codes.sql. */
export const SQL_CREATE_PROMO_CODES = `
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export const SQL_CREATE_PROMO_REDEMPTIONS = `
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

export async function ensurePromoSchema(
  getConnection: () => Promise<SqlConnection> = loadDefaultConnection,
): Promise<void> {
  await ensureSchemaOnce(
    "promo",
    [PROMO_MIGRATION],
    getConnection,
    async (connection) => {
      await connection.execute(SQL_CREATE_PROMO_CODES, []);
      await connection.execute(SQL_CREATE_PROMO_REDEMPTIONS, []);
    },
  );
}
