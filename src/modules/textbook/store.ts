import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { getTextbookBlocks } from "@/content/learningMaterials/textbook";
import type { MaterialContentBlock } from "@/content/learningMaterials/sourceBlocks";
import { blocksToTextbookMarkup, parseTextbookMarkup } from "./markup";
import { ensureTextbookSchema } from "./schema";

export const TEXTBOOK_BODY_MAX = 1_000_000;

type Conn = () => Promise<SqlConnection>;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

function staticMarkup(themeCode: string): string {
  return blocksToTextbookMarkup(getTextbookBlocks(themeCode));
}

export type TextbookSectionState = {
  published: boolean;
  draft: boolean;
};

export type TextbookEditorSource = {
  /** Saved draft, or the static conspect markup when nothing is stored. */
  body: string;
  /** Non-empty published markup. Null means the student still sees the static conspect. */
  publishedBody: string | null;
};

/**
 * Reads one section. Does not insert a row and does not copy static text into
 * `published_body`. A missing table or a dead database falls back to the conspect.
 */
export async function loadTextbookEditorSource(
  themeCode: string,
  getConnection: Conn = loadDefaultConnection,
): Promise<TextbookEditorSource> {
  const fallback: TextbookEditorSource = {
    body: staticMarkup(themeCode),
    publishedBody: null,
  };
  try {
    await ensureTextbookSchema(getConnection);
    const connection = await getConnection();
    try {
      const rows = await connection.query<{
        body: string;
        published_body: string | null;
      }>(
        `SELECT body, published_body
         FROM textbook_sections
         WHERE theme_code = ?
         LIMIT 1`,
        [themeCode],
      );
      const row = rows[0];
      if (!row) return fallback;
      const published = row.published_body?.trim() ? row.published_body : null;
      return { body: row.body ?? "", publishedBody: published };
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("textbook editor read failed", error);
    return fallback;
  }
}

export async function listTextbookSectionStates(
  getConnection: Conn = loadDefaultConnection,
): Promise<Map<string, TextbookSectionState>> {
  try {
    await ensureTextbookSchema(getConnection);
    const connection = await getConnection();
    try {
      const rows = await connection.query<{
        theme_code: string;
        published: number;
        draft: number;
      }>(
        `SELECT theme_code,
                (published_body IS NOT NULL AND CHAR_LENGTH(TRIM(published_body)) > 0) AS published,
                NOT (body <=> published_body) AS draft
         FROM textbook_sections`,
      );
      return new Map(
        rows.map((row) => [
          row.theme_code,
          { published: Number(row.published) === 1, draft: Number(row.draft) === 1 },
        ]),
      );
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("textbook section list failed", error);
    return new Map();
  }
}

export async function getPublishedTextbookBlocks(
  themeCode: string,
  getConnection: Conn = loadDefaultConnection,
): Promise<MaterialContentBlock[]> {
  const fallback = () => getTextbookBlocks(themeCode);
  try {
    await ensureTextbookSchema(getConnection);
    const connection = await getConnection();
    try {
      const rows = await connection.query<{ published_body: string | null }>(
        `SELECT published_body FROM textbook_sections WHERE theme_code = ? LIMIT 1`,
        [themeCode],
      );
      const body = rows[0]?.published_body ?? "";
      if (!body.trim()) return fallback();
      return parseTextbookMarkup(body);
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("textbook published read failed", error);
    return fallback();
  }
}

async function themeExists(connection: SqlConnection, themeCode: string): Promise<boolean> {
  const rows = await connection.query<{ code: string }>(
    `SELECT code FROM themes WHERE code = ? LIMIT 1`,
    [themeCode],
  );
  return Boolean(rows[0]);
}

export async function saveTextbookSection(input: {
  themeCode: string;
  body: string;
  publish: boolean;
  userId: number;
  getConnection?: Conn;
}): Promise<boolean> {
  const getConnection = input.getConnection ?? loadDefaultConnection;
  await ensureTextbookSchema(getConnection);
  const connection = await getConnection();
  try {
    if (!(await themeExists(connection, input.themeCode))) return false;
    await connection.execute(
      `INSERT INTO textbook_sections (theme_code, body, published_body, updated_by)
       VALUES (?, ?, NULL, ?)
       ON DUPLICATE KEY UPDATE
         body = VALUES(body),
         updated_by = VALUES(updated_by)`,
      [input.themeCode, input.body, input.userId],
    );
    if (input.publish) {
      await connection.execute(
        `UPDATE textbook_sections
         SET published_body = body, updated_by = ?
         WHERE theme_code = ?`,
        [input.userId, input.themeCode],
      );
    }
    return true;
  } finally {
    connection.release();
  }
}
