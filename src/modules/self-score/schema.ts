import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";
import { ensureSchemaOnce } from "@/lib/db/schemaGuard";

const SQL_CREATE_SELF_SCORES = `
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/** Creates `user_self_scores` once per process if the migration is not recorded. */
export async function ensureSelfScoreSchema(
  getConnection: () => Promise<SqlConnection> = loadDefaultConnection,
): Promise<void> {
  await ensureSchemaOnce(
    "self_score",
    ["007_user_self_scores.sql"],
    getConnection,
    async (connection) => {
      await connection.execute(SQL_CREATE_SELF_SCORES, []);
    },
  );
}

export async function loadSelfScoreConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}
