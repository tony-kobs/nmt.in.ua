import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";
import { ensureSchemaOnce } from "@/lib/db/schemaGuard";

const SQL_CREATE_TEXTBOOK_SECTIONS = `
  CREATE TABLE IF NOT EXISTS textbook_sections (
    theme_code VARCHAR(32) NOT NULL,
    body MEDIUMTEXT NOT NULL,
    published_body MEDIUMTEXT NULL,
    updated_by INT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (theme_code)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/** Creates `textbook_sections` once per process if the migration is not recorded. */
export async function ensureTextbookSchema(
  getConnection: () => Promise<SqlConnection> = loadDefaultConnection,
): Promise<void> {
  await ensureSchemaOnce(
    "textbook",
    ["059_textbook_sections.sql"],
    getConnection,
    async (connection) => {
      await connection.execute(SQL_CREATE_TEXTBOOK_SECTIONS, []);
    },
  );
}
