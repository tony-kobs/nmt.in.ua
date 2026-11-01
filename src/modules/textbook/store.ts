import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { getTextbookBlocks } from "@/content/learningMaterials/textbook";
import type { MaterialContentBlock } from "@/content/learningMaterials/sourceBlocks";
import { mysqlErrno } from "@/modules/teacher-students/mysqlErrno";
import {
  TEXTBOOK_BODY_MAX,
  TEXTBOOK_VERSION_LIMIT,
  type TextbookDraftRow,
  type TextbookVersionSummary,
  type TextbookWriteResult,
} from "./draftTypes";
import { blocksToTextbookMarkup, parseTextbookMarkup } from "./markup";
import { ensureTextbookSchema } from "./schema";

export { TEXTBOOK_BODY_MAX } from "./draftTypes";

type Conn = () => Promise<SqlConnection>;

const SQL_READ_SECTION = `SELECT body, published_body, draft_revision,
            UNIX_TIMESTAMP(updated_at) AS updated_at_sec
     FROM textbook_sections
     WHERE theme_code = ?
     LIMIT 1`;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

function staticMarkup(themeCode: string): string {
  return blocksToTextbookMarkup(getTextbookBlocks(themeCode));
}

function storedRevision(value: unknown): number {
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 1) return 1;
  return revision;
}

function isoFromUnix(value: unknown): string | null {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

function authorName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  return name || "—";
}

export type TextbookSectionState = {
  published: boolean;
  draft: boolean;
};

export type TextbookEditorSource = TextbookDraftRow & {
  /** Non-empty published markup. Null means the student still sees the static conspect. */
  publishedBody: string | null;
};

type SectionRow = {
  body: string;
  published_body: string | null;
  draft_revision: number | string | null;
  updated_at_sec: number | string | null;
};

function sourceFromRow(row: SectionRow | undefined, themeCode: string): TextbookEditorSource {
  if (!row) {
    return {
      body: staticMarkup(themeCode),
      publishedBody: null,
      revision: 0,
      updatedAt: null,
    };
  }
  const published = row.published_body?.trim() ? row.published_body : null;
  return {
    body: row.body ?? "",
    publishedBody: published,
    revision: storedRevision(row.draft_revision),
    updatedAt: isoFromUnix(row.updated_at_sec),
  };
}

async function readSectionRow(
  connection: SqlConnection,
  themeCode: string,
): Promise<SectionRow | undefined> {
  const rows = await connection.query<SectionRow>(SQL_READ_SECTION, [themeCode]);
  return rows[0];
}

/**
 * Reads one section. Does not insert a row and does not copy static text into
 * `published_body`. A missing table or a dead database falls back to the conspect.
 */
export async function loadTextbookEditorSource(
  themeCode: string,
  getConnection: Conn = loadDefaultConnection,
): Promise<TextbookEditorSource> {
  const fallback = sourceFromRow(undefined, themeCode);
  try {
    await ensureTextbookSchema(getConnection);
    const connection = await getConnection();
    try {
      return sourceFromRow(await readSectionRow(connection, themeCode), themeCode);
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("textbook editor read failed", error);
    return fallback;
  }
}

/** The stored draft only. Throws when the database is down — no static fallback. */
export async function readTextbookDraftRow(
  themeCode: string,
  getConnection: Conn = loadDefaultConnection,
): Promise<TextbookDraftRow> {
  await ensureTextbookSchema(getConnection);
  const connection = await getConnection();
  try {
    const row = await readSectionRow(connection, themeCode);
    if (!row) return { body: "", revision: 0, updatedAt: null };
    return {
      body: row.body ?? "",
      revision: storedRevision(row.draft_revision),
      updatedAt: isoFromUnix(row.updated_at_sec),
    };
  } finally {
    connection.release();
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

export async function listTextbookVersions(
  themeCode: string,
  getConnection: Conn = loadDefaultConnection,
): Promise<TextbookVersionSummary[]> {
  try {
    await ensureTextbookSchema(getConnection);
    const connection = await getConnection();
    try {
      const rows = await connection.query<{
        id: number | string;
        author_name: string | null;
        created_at_sec: number | string | null;
      }>(
        `SELECT v.id,
                u.display_name AS author_name,
                UNIX_TIMESTAMP(v.created_at) AS created_at_sec
         FROM textbook_section_versions v
         LEFT JOIN app_users u ON u.id = v.created_by
         WHERE v.theme_code = ?
         ORDER BY v.id DESC
         LIMIT ${TEXTBOOK_VERSION_LIMIT}`,
        [themeCode],
      );
      return rows.flatMap((row) => {
        const id = Number(row.id);
        const createdAt = isoFromUnix(row.created_at_sec);
        if (!Number.isInteger(id) || id < 1 || !createdAt) return [];
        return [{ id, authorName: authorName(row.author_name), createdAt }];
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("textbook versions read failed", error);
    return [];
  }
}

export async function loadTextbookVersionBody(
  themeCode: string,
  versionId: number,
  getConnection: Conn = loadDefaultConnection,
): Promise<string | null> {
  if (!Number.isInteger(versionId) || versionId < 1) return null;
  await ensureTextbookSchema(getConnection);
  const connection = await getConnection();
  try {
    const rows = await connection.query<{ body: string }>(
      `SELECT body
       FROM textbook_section_versions
       WHERE id = ? AND theme_code = ?
       LIMIT 1`,
      [versionId, themeCode],
    );
    return rows[0]?.body ?? null;
  } finally {
    connection.release();
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

function revisionAccepted(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 1_000_000_000;
}

async function applyDraft(
  connection: SqlConnection,
  input: { themeCode: string; body: string; expectedRevision: number; userId: number },
): Promise<{ ok: true; revision: number } | { ok: false; reason: "theme" | "conflict" }> {
  if (!revisionAccepted(input.expectedRevision)) return { ok: false, reason: "conflict" };
  if (!(await themeExists(connection, input.themeCode))) return { ok: false, reason: "theme" };
  if (input.expectedRevision === 0) {
    try {
      await connection.execute(
        `INSERT INTO textbook_sections (theme_code, body, published_body, updated_by, draft_revision)
         VALUES (?, ?, NULL, ?, 1)`,
        [input.themeCode, input.body, input.userId],
      );
    } catch (error) {
      if (mysqlErrno(error) === 1062) return { ok: false, reason: "conflict" };
      throw error;
    }
    return { ok: true, revision: 1 };
  }
  const updated = await connection.execute(
    `UPDATE textbook_sections
     SET body = ?, updated_by = ?, draft_revision = draft_revision + 1
     WHERE theme_code = ? AND draft_revision = ?`,
    [input.body, input.userId, input.themeCode, input.expectedRevision],
  );
  if (updated.affectedRows < 1) return { ok: false, reason: "conflict" };
  return { ok: true, revision: input.expectedRevision + 1 };
}

async function writeSection(input: {
  themeCode: string;
  body: string;
  expectedRevision: number;
  userId: number;
  publish: boolean;
  getConnection: Conn;
}): Promise<TextbookWriteResult> {
  if (input.body.length > TEXTBOOK_BODY_MAX) return { ok: false, reason: "size" };
  await ensureTextbookSchema(input.getConnection);
  const connection = await input.getConnection();
  try {
    await connection.beginTransaction();
    try {
      const applied = await applyDraft(connection, input);
      if (!applied.ok) {
        await connection.rollback();
        return applied;
      }
      if (input.publish) {
        await connection.execute(
          `UPDATE textbook_sections
           SET published_body = body, updated_by = ?
           WHERE theme_code = ?`,
          [input.userId, input.themeCode],
        );
        await connection.execute(
          `INSERT INTO textbook_section_versions (theme_code, body, created_by)
           VALUES (?, ?, ?)`,
          [input.themeCode, input.body, input.userId],
        );
      }
      await connection.commit();
      return { ok: true, revision: applied.revision, savedAt: new Date().toISOString() };
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("textbook draft rollback failed", rollbackError);
      }
      throw error;
    }
  } finally {
    connection.release();
  }
}

/**
 * Saves a draft when `expectedRevision` still matches. `0` means there is no row yet.
 * Publish also copies the draft into `published_body` and appends one version.
 * A mismatch leaves the stored draft untouched.
 */
export async function saveTextbookDraft(input: {
  themeCode: string;
  body: string;
  expectedRevision: number;
  userId: number;
  publish: boolean;
  getConnection?: Conn;
}): Promise<TextbookWriteResult> {
  return writeSection({
    ...input,
    getConnection: input.getConnection ?? loadDefaultConnection,
  });
}

/** Puts a published snapshot back into the draft. The live text stays until the next publish. */
export async function restoreTextbookVersion(input: {
  themeCode: string;
  versionId: number;
  expectedRevision: number;
  userId: number;
  getConnection?: Conn;
}): Promise<TextbookWriteResult> {
  const getConnection = input.getConnection ?? loadDefaultConnection;
  if (!Number.isInteger(input.versionId) || input.versionId < 1) {
    return { ok: false, reason: "version" };
  }
  const body = await loadTextbookVersionBody(input.themeCode, input.versionId, getConnection);
  if (body === null) return { ok: false, reason: "version" };
  const saved = await saveTextbookDraft({
    themeCode: input.themeCode,
    body,
    expectedRevision: input.expectedRevision,
    userId: input.userId,
    publish: false,
    getConnection,
  });
  if (!saved.ok) return saved;
  return { ...saved, body };
}
