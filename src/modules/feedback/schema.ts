import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";

const SQL_CREATE_FEEDBACK = `
  CREATE TABLE IF NOT EXISTS site_feedback (
    id INT NOT NULL AUTO_INCREMENT,
    user_id INT NULL,
    session_id INT NULL,
    score TINYINT NOT NULL,
    message TEXT NULL,
    email VARCHAR(255) NULL,
    source ENUM('footer', 'post_test') NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_site_feedback_created (created_at),
    KEY idx_site_feedback_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

let schemaReady: Promise<void> | undefined;

async function runFeedbackSchemaMigration(
  getConnection: () => Promise<SqlConnection>,
): Promise<void> {
  const connection = await getConnection();
  try {
    await connection.execute(SQL_CREATE_FEEDBACK, []);
  } finally {
    connection.release();
  }
}

/** Creates `site_feedback` once per process if the table is missing. */
export async function ensureFeedbackSchema(
  getConnection: () => Promise<SqlConnection> = loadDefaultConnection,
): Promise<void> {
  if (!schemaReady) {
    schemaReady = runFeedbackSchemaMigration(getConnection).catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  await schemaReady;
}

export async function loadFeedbackConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}
