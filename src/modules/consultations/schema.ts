import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";
import { ensureSchemaOnce } from "@/lib/db/schemaGuard";

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

/** Creates `consultation_requests` once per process if the migration is not recorded. */
export async function ensureConsultationSchema(
  getConnection: () => Promise<SqlConnection> = loadDefaultConnection,
): Promise<void> {
  await ensureSchemaOnce(
    "consultations",
    ["019_consultation_requests.sql"],
    getConnection,
    async (connection) => {
      await connection.execute(SQL_CREATE_CONSULTATION_REQUESTS, []);
    },
  );
}

export async function loadConsultationConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}
