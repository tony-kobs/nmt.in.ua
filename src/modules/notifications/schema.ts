import type { SqlConnection } from "@/lib/db/mysql";

const SQL_CREATE = `
  CREATE TABLE IF NOT EXISTS user_notifications (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    kind VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    link VARCHAR(512) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_user_notifications_user (user_id, read_at, id),
    KEY idx_user_notifications_once (user_id, kind, link(191))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

type Conn = () => Promise<SqlConnection>;

let schemaReady: Promise<void> | undefined;

export async function createUserNotificationsTable(
  connection: SqlConnection,
): Promise<void> {
  await connection.execute(SQL_CREATE, []);
}

async function run(getConnection: Conn): Promise<void> {
  const connection = await getConnection();
  try {
    await createUserNotificationsTable(connection);
  } finally {
    connection.release();
  }
}

export async function ensureUserNotificationsSchema(
  getConnection: Conn,
): Promise<void> {
  if (!schemaReady) {
    schemaReady = run(getConnection).catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  await schemaReady;
}

/** Test helper: the next ensure opens a fresh connection. */
export function resetUserNotificationsSchemaForTests(): void {
  schemaReady = undefined;
}
