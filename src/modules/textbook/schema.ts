import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";
import { ensureSchemaOnce } from "@/lib/db/schemaGuard";
import { mysqlErrno } from "@/modules/teacher-students/mysqlErrno";

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

const SQL_CREATE_TEXTBOOK_VERSIONS = `
  CREATE TABLE IF NOT EXISTS textbook_section_versions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    theme_code VARCHAR(32) NOT NULL,
    body MEDIUMTEXT NOT NULL,
    created_by INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_textbook_section_versions_theme (theme_code, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const SQL_CREATE_TEXTBOOK_IMAGES = `
  CREATE TABLE IF NOT EXISTS textbook_images (
    content_hash CHAR(64) NOT NULL,
    mime VARCHAR(32) NOT NULL,
    bytes MEDIUMBLOB NOT NULL,
    byte_length INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (content_hash)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

async function addDraftRevision(connection: SqlConnection): Promise<void> {
  try {
    await connection.execute(
      `ALTER TABLE textbook_sections
       ADD COLUMN draft_revision INT UNSIGNED NOT NULL DEFAULT 1`,
      [],
    );
  } catch (error) {
    if (mysqlErrno(error) === 1060) return;
    throw error;
  }
}

/**
 * Creates `textbook_sections` and the publish history once per process
 * if `059` / `061` are not recorded yet. A recorded migration skips DDL.
 */
export async function ensureTextbookSchema(
  getConnection: () => Promise<SqlConnection> = loadDefaultConnection,
): Promise<void> {
  await ensureSchemaOnce(
    "textbook",
    ["059_textbook_sections.sql", "061_textbook_section_versions.sql"],
    getConnection,
    async (connection) => {
      await connection.execute(SQL_CREATE_TEXTBOOK_SECTIONS, []);
      await connection.execute(SQL_CREATE_TEXTBOOK_VERSIONS, []);
      await addDraftRevision(connection);
    },
  );
}

/** Uploaded textbook figures. Same bytes share one row (`content_hash`). */
export async function ensureTextbookImageSchema(
  getConnection: () => Promise<SqlConnection> = loadDefaultConnection,
): Promise<void> {
  await ensureSchemaOnce(
    "textbook-images",
    ["060_textbook_images.sql"],
    getConnection,
    async (connection) => {
      await connection.execute(SQL_CREATE_TEXTBOOK_IMAGES, []);
    },
  );
}
