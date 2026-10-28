import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { getTextbookBlocks, textbookThemeCodes } from "@/content/learningMaterials/textbook";
import type { MaterialContentBlock } from "@/content/learningMaterials/sourceBlocks";
import { blocksToTextbookMarkup, parseTextbookMarkup } from "./markup";
import { ensureTextbookSchema } from "./schema";

export const TEXTBOOK_BODY_MAX = 1_000_000;

type Conn = () => Promise<SqlConnection>;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

let seeding: Promise<void> | null = null;
let seedMarkup: Array<{ code: string; body: string }> | null = null;

function markupSeed(): Array<{ code: string; body: string }> {
  if (!seedMarkup) {
    seedMarkup = textbookThemeCodes()
      .map((code) => ({
        code,
        body: blocksToTextbookMarkup(getTextbookBlocks(code)),
      }))
      .filter((row) => row.body.trim().length > 0);
  }
  return seedMarkup;
}

async function insertSeed(getConnection: Conn): Promise<void> {
  const rows = markupSeed();
  const connection = await getConnection();
  try {
    for (const row of rows) {
      await connection.execute(
        `INSERT IGNORE INTO textbook_sections (theme_code, body, published_body)
         VALUES (?, ?, ?)`,
        [row.code, row.body, row.body],
      );
    }
  } finally {
    connection.release();
  }
}

/** Fills themes that still have no row. Later edits stay as the admin saved them. */
export async function ensureTextbookSeed(
  getConnection: Conn = loadDefaultConnection,
): Promise<void> {
  await ensureTextbookSchema(getConnection);
  if (!seeding) {
    seeding = insertSeed(getConnection).catch((error: unknown) => {
      seeding = null;
      throw error;
    });
  }
  await seeding;
}

export type TextbookSectionState = {
  published: boolean;
  draft: boolean;
};

export async function listTextbookSectionStates(
  getConnection: Conn = loadDefaultConnection,
): Promise<Map<string, TextbookSectionState>> {
  await ensureTextbookSeed(getConnection);
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
}

export async function loadTextbookDraft(
  themeCode: string,
  getConnection: Conn = loadDefaultConnection,
): Promise<string> {
  await ensureTextbookSeed(getConnection);
  const connection = await getConnection();
  try {
    const rows = await connection.query<{ body: string }>(
      `SELECT body FROM textbook_sections WHERE theme_code = ? LIMIT 1`,
      [themeCode],
    );
    return rows[0]?.body ?? "";
  } finally {
    connection.release();
  }
}

export async function getPublishedTextbookBlocks(
  themeCode: string,
  getConnection: Conn = loadDefaultConnection,
): Promise<MaterialContentBlock[]> {
  await ensureTextbookSeed(getConnection);
  const connection = await getConnection();
  try {
    const rows = await connection.query<{ published_body: string | null }>(
      `SELECT published_body FROM textbook_sections WHERE theme_code = ? LIMIT 1`,
      [themeCode],
    );
    const body = rows[0]?.published_body ?? "";
    if (!body.trim()) return [];
    return parseTextbookMarkup(body);
  } finally {
    connection.release();
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
  await ensureTextbookSeed(getConnection);
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
