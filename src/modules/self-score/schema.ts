import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";

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

let schemaReady: Promise<void> | undefined;

async function runSelfScoreSchemaMigration(
  getConnection: () => Promise<SqlConnection>,
): Promise<void> {
  const connection = await getConnection();
  try {
    await connection.execute(SQL_CREATE_SELF_SCORES, []);
  } finally {
    connection.release();
  }
}

/** Creates `user_self_scores` once per process if the table is missing. */
export async function ensureSelfScoreSchema(
  getConnection: () => Promise<SqlConnection> = loadDefaultConnection,
): Promise<void> {
  if (!schemaReady) {
    schemaReady = runSelfScoreSchemaMigration(getConnection).catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  await schemaReady;
}

export async function loadSelfScoreConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}
