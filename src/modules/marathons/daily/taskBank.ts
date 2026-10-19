import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { sampleRandomIds } from "@/lib/sampleRandomIds";

/**
 * The topic bank is `themes` + `quiz_tasks`. Those tables have no subject
 * column: they are the mathematics catalog. A marathon shows the picker only
 * when its subject is `math`. Manual tasks stay available for every subject.
 * No new table and no migration.
 */
export const QUIZ_BANK_SUBJECT = "math";
export const BANK_SAMPLE_MAX = 20;
const EXCLUDE_CAP = 200;

export function quizBankMatchesSubject(subject: string): boolean {
  return subject.trim().toLowerCase() === QUIZ_BANK_SUBJECT;
}

export function clampCount(count: number): number {
  if (!Number.isInteger(count) || count < 1) return 1;
  return Math.min(BANK_SAMPLE_MAX, count);
}

export function sanitizeIds(ids: readonly number[]): number[] {
  const seen = new Set<number>();
  const clean: number[] = [];
  for (const id of ids) {
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    clean.push(id);
    if (clean.length >= EXCLUDE_CAP) break;
  }
  return clean;
}

/** Random distinct ids from the topic, skipping ones already chosen. */
export function pickBankIds(
  allIds: readonly number[],
  count: number,
  exclude: readonly number[],
): number[] {
  const banned = new Set(exclude);
  const seen = new Set<number>();
  const pool: number[] = [];
  for (const id of allIds) {
    if (!Number.isInteger(id) || id <= 0 || banned.has(id) || seen.has(id)) continue;
    seen.add(id);
    pool.push(id);
  }
  return sampleRandomIds(pool, clampCount(count));
}

export type BankTheme = {
  id: number;
  code: string;
  name: string;
  count: number;
};

export type BankPreview = {
  id: number;
  prompt: string;
  options: string[];
};

export const BANK_THEMES_SQL = `
  SELECT t.id, t.code, t.name, COUNT(q.id) AS task_count
  FROM themes t
  INNER JOIN quiz_tasks q ON q.theme_id = t.id
  GROUP BY t.id, t.code, t.name, t.ord
  ORDER BY t.ord ASC, t.id ASC
`;

/** Prompt and options only. The key (`right_answer_n`) and comments stay out. */
export function bankPreviewSql(count: number): string {
  const marks = Array.from({ length: count }, () => "?").join(", ");
  return `SELECT id, name, task_text, answer_1, answer_2, answer_3, answer_4
    FROM quiz_tasks
    WHERE theme_id = ? AND id IN (${marks})`;
}

type PreviewRow = {
  id: number;
  name: string | null;
  task_text: string | null;
  answer_1: string | null;
  answer_2: string | null;
  answer_3: string | null;
  answer_4: string | null;
};

export function toBankPreview(row: PreviewRow): BankPreview {
  const prompt = (row.task_text || row.name || "").trim();
  const options = [row.answer_1, row.answer_2, row.answer_3, row.answer_4]
    .map((item) => (item ?? "").trim())
    .filter((item) => item.length > 0);
  return { id: Number(row.id), prompt, options };
}

type Conn = () => Promise<SqlConnection>;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

async function withSql<T>(
  fn: (connection: SqlConnection) => Promise<T>,
  getConnection: Conn = loadDefaultConnection,
): Promise<T> {
  const connection = await getConnection();
  try {
    return await fn(connection);
  } finally {
    connection.release();
  }
}

export async function listBankThemes(
  subject: string,
  getConnection?: Conn,
): Promise<BankTheme[]> {
  if (!quizBankMatchesSubject(subject)) return [];
  return withSql(async (connection) => {
    const rows = await connection.query<{
      id: number;
      code: string | null;
      name: string;
      task_count: number | string;
    }>(BANK_THEMES_SQL);
    return rows.map((row) => ({
      id: Number(row.id),
      code: (row.code ?? "").trim(),
      name: row.name.trim(),
      count: Number(row.task_count) || 0,
    }));
  }, getConnection);
}

export async function sampleThemePreviews(
  input: {
    subject: string;
    themeId: number;
    count: number;
    excludeIds: readonly number[];
  },
  getConnection?: Conn,
): Promise<BankPreview[]> {
  if (!quizBankMatchesSubject(input.subject)) return [];
  if (!Number.isInteger(input.themeId) || input.themeId <= 0) return [];
  const exclude = sanitizeIds(input.excludeIds);
  return withSql(async (connection) => {
    const rows = await connection.query<{ id: number }>(
      `SELECT id FROM quiz_tasks WHERE theme_id = ?`,
      [input.themeId],
    );
    const picked = pickBankIds(
      rows.map((row) => Number(row.id)),
      input.count,
      exclude,
    );
    if (picked.length === 0) return [];
    const found = await connection.query<PreviewRow>(
      bankPreviewSql(picked.length),
      [input.themeId, ...picked],
    );
    const byId = new Map(found.map((row) => [Number(row.id), toBankPreview(row)]));
    return picked.flatMap((id) => {
      const preview = byId.get(id);
      return preview ? [preview] : [];
    });
  }, getConnection);
}

async function ensureDays(getConnection: Conn): Promise<void> {
  const { ensureMarathonSchema } = await import("../schema");
  await ensureMarathonSchema(getConnection);
}

export async function dayBelongsToMarathon(
  marathonId: number,
  dayId: number,
  getConnection?: Conn,
): Promise<boolean> {
  if (!Number.isInteger(marathonId) || !Number.isInteger(dayId)) return false;
  return withSql(async (connection) => {
    const rows = await connection.query<{ id: number }>(
      `SELECT id FROM marathon_days WHERE id = ? AND marathon_id = ? LIMIT 1`,
      [dayId, marathonId],
    );
    return Boolean(rows[0]);
  }, getConnection);
}

/**
 * Append bank questions in the given order. Ids that are missing, belong to
 * another theme, or are already on the day are skipped. Returns how many rows
 * were inserted.
 */
export async function insertSampledTasks(
  input: { dayId: number; themeId: number; questionIds: readonly number[] },
  getConnection: Conn = loadDefaultConnection,
): Promise<number> {
  const questionIds = sanitizeIds(input.questionIds).slice(0, BANK_SAMPLE_MAX);
  if (questionIds.length === 0 || !Number.isInteger(input.themeId) || input.themeId <= 0) {
    return 0;
  }
  await ensureDays(getConnection);
  return withSql(async (connection) => {
    await connection.beginTransaction();
    try {
      const allowed = await connection.query<{ id: number }>(
        `SELECT id FROM quiz_tasks WHERE theme_id = ? AND id IN (${questionIds.map(() => "?").join(", ")})`,
        [input.themeId, ...questionIds],
      );
      const allowedIds = new Set(allowed.map((row) => Number(row.id)));
      const existing = await connection.query<{ question_id: number }>(
        `SELECT question_id FROM marathon_day_tasks
         WHERE day_id = ? AND question_id IS NOT NULL`,
        [input.dayId],
      );
      const used = new Set(existing.map((row) => Number(row.question_id)));
      const fresh = questionIds.filter((id) => allowedIds.has(id) && !used.has(id));
      if (fresh.length === 0) {
        await connection.commit();
        return 0;
      }
      const maxRows = await connection.query<{ max_order: number | null }>(
        `SELECT COALESCE(MAX(sort_order), 0) AS max_order
         FROM marathon_day_tasks WHERE day_id = ?`,
        [input.dayId],
      );
      let order = Number(maxRows[0]?.max_order ?? 0);
      for (const questionId of fresh) {
        order += 1;
        await connection.execute(
          `INSERT INTO marathon_day_tasks
            (day_id, sort_order, question_id, inline_prompt, inline_options, inline_correct, inline_explanation)
           VALUES (?, ?, ?, NULL, NULL, NULL, NULL)`,
          [input.dayId, order, questionId],
        );
      }
      await connection.commit();
      return fresh.length;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }, getConnection);
}

export type ReplaceResult = "replaced" | "none" | "missing";

/** Swap one saved bank task for another question from the same theme. */
export async function replaceBankTask(
  dayId: number,
  taskId: number,
  getConnection: Conn = loadDefaultConnection,
): Promise<ReplaceResult> {
  await ensureDays(getConnection);
  return withSql(async (connection) => {
    const current = await connection.query<{ question_id: number; theme_id: number }>(
      `SELECT t.question_id, q.theme_id
       FROM marathon_day_tasks t
       INNER JOIN quiz_tasks q ON q.id = t.question_id
       WHERE t.id = ? AND t.day_id = ?
       LIMIT 1`,
      [taskId, dayId],
    );
    const row = current[0];
    if (!row) return "missing";
    const usedRows = await connection.query<{ question_id: number }>(
      `SELECT question_id FROM marathon_day_tasks
       WHERE day_id = ? AND question_id IS NOT NULL`,
      [dayId],
    );
    const pool = await connection.query<{ id: number }>(
      `SELECT id FROM quiz_tasks WHERE theme_id = ?`,
      [row.theme_id],
    );
    const next = pickBankIds(
      pool.map((item) => Number(item.id)),
      1,
      usedRows.map((item) => Number(item.question_id)),
    )[0];
    if (next == null) return "none";
    await connection.execute(
      `UPDATE marathon_day_tasks SET question_id = ? WHERE id = ? AND day_id = ?`,
      [next, taskId, dayId],
    );
    return "replaced";
  }, getConnection);
}

/** Rewrite sort order of every task on the day. Fewer than two tasks is a no-op. */
export async function reshuffleDayTaskOrder(
  dayId: number,
  getConnection: Conn = loadDefaultConnection,
): Promise<boolean> {
  await ensureDays(getConnection);
  return withSql(async (connection) => {
    const rows = await connection.query<{ id: number }>(
      `SELECT id FROM marathon_day_tasks WHERE day_id = ? ORDER BY sort_order ASC, id ASC`,
      [dayId],
    );
    const ids = rows.map((row) => Number(row.id));
    if (ids.length < 2) return false;
    const order = sampleRandomIds(ids, ids.length);
    await connection.beginTransaction();
    try {
      await connection.execute(
        `UPDATE marathon_day_tasks SET sort_order = -id WHERE day_id = ?`,
        [dayId],
      );
      for (let index = 0; index < order.length; index += 1) {
        await connection.execute(
          `UPDATE marathon_day_tasks SET sort_order = ? WHERE id = ? AND day_id = ?`,
          [index + 1, order[index], dayId],
        );
      }
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }, getConnection);
}
