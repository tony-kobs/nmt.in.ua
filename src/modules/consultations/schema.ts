import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";

const SQL_CREATE_CONSULTATION_REQUESTS = `
  CREATE TABLE IF NOT EXISTS consultation_requests (
    id INT NOT NULL AUTO_INCREMENT,
    student_id INT NOT NULL,
    note TEXT NULL,
    status ENUM('pending', 'acknowledged', 'closed') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMP NULL DEFAULT NULL,
    closed_at TIMESTAMP NULL DEFAULT NULL,
    handled_by INT NULL,
    PRIMARY KEY (id),
    KEY idx_consultation_requests_student_status (student_id, status),
    KEY idx_consultation_requests_status_created (status, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

let schemaReady: Promise<void> | undefined;

async function runConsultationSchemaMigration(
  getConnection: () => Promise<SqlConnection>,
): Promise<void> {
  const connection = await getConnection();
  try {
    await connection.execute(SQL_CREATE_CONSULTATION_REQUESTS, []);
  } finally {
    connection.release();
  }
}

/** Creates `consultation_requests` once per process if the table is missing. */
export async function ensureConsultationSchema(
  getConnection: () => Promise<SqlConnection> = loadDefaultConnection,
): Promise<void> {
  if (!schemaReady) {
    schemaReady = runConsultationSchemaMigration(getConnection).catch(
      (error) => {
        schemaReady = undefined;
        throw error;
      },
    );
  }
  await schemaReady;
}

export async function loadConsultationConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}
