import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { publishedQuizTaskSql } from "@/lib/publishedQuizTask";
import { sampleRandomIds } from "@/lib/sampleRandomIds";
import {
  BANK_PAGE_SIZE,
  bankSearchPages,
  matchesBankQuery,
} from "./bankSearchText";
import { DAY_BLOCK_MAX, DAY_HAS_ANSWERS_SQL } from "./dayRemoval";

/**
 * The topic bank is `themes` + `quiz_tasks`. Those tables have no subject
 * column: they are the mathematics catalog. The day editor searches that
 * catalog and saves the exact ids the admin picked, in that order.
 * `pickBankIds` remains for older callers; the admin UI does not use it.
 * No new table and no migration.
 */
export const QUIZ_BANK_SUBJECT = "math";
export const BANK_SAMPLE_MAX = 20;
export const BANK_SEARCH_LIMIT = BANK_PAGE_SIZE;
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

/** Same ids, ignoring order. Duplicates are not a match. */
export function sameQuestionSet(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false;
  const seen = new Set<number>();
  for (const id of left) {
    if (!Number.isInteger(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return right.every((id) => seen.has(id));
}

export function cleanBlockIds(
  ids: readonly number[],
): { ok: true; ids: number[] } | { ok: false; reason: "invalid" | "too_many" } {
  if (ids.length > DAY_BLOCK_MAX) return { ok: false, reason: "too_many" };
  const seen = new Set<number>();
  const clean: number[] = [];
  for (const id of ids) {
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) return { ok: false, reason: "invalid" };
    seen.add(id);
    clean.push(id);
  }
  return { ok: true, ids: clean };
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
  INNER JOIN quiz_tasks q ON q.theme_id = t.id AND ${publishedQuizTaskSql("q")}
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

/**
 * Filters only. The words, apostrophes and formulas are matched in JS
 * (`matchesBankQuery`), so this statement stays valid on MySQL 8 and MariaDB.
 * No nested REPLACE and no REGEXP.
 */
const BANK_SEARCH_WHERE = `
  WHERE ${publishedQuizTaskSql("q")}
    AND (? = 0 OR q.theme_id = ?)
    AND (? = 0 OR q.difficulty = ?)
    AND (
      ? = 0
      OR (? = 2 AND (q.answer_3 IS NULL OR q.answer_3 = '') AND (q.answer_4 IS NULL OR q.answer_4 = ''))
      OR (? = 4 AND q.answer_3 <> '' AND q.answer_4 <> '')
    )
`;

export const BANK_SEARCH_SCAN_MAX = 5000;

export const BANK_SEARCH_SQL = `
  SELECT q.id, q.name, q.task_text, q.answer_1, q.answer_2, q.answer_3, q.answer_4,
         q.difficulty, t.name AS theme_name,
         (
           SELECT GROUP_CONCAT(d.day_number ORDER BY d.day_number SEPARATOR ',')
           FROM marathon_day_tasks ot
           INNER JOIN marathon_days d ON d.id = ot.day_id
           WHERE ot.question_id = q.id AND d.marathon_id = ? AND ot.day_id <> ?
         ) AS other_days
  FROM quiz_tasks q
  INNER JOIN themes t ON t.id = q.theme_id
  ${BANK_SEARCH_WHERE}
  ORDER BY t.ord ASC, q.id ASC
  LIMIT ${BANK_SEARCH_SCAN_MAX}
`;

export type BankHit = BankPreview & {
  themeName: string;
  difficulty: number;
  otherDays: number[];
};

export type BankSearchPage = {
  tasks: BankHit[];
  total: number;
  page: number;
  pageSize: number;
};

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
      `SELECT id FROM quiz_tasks WHERE theme_id = ? AND ${publishedQuizTaskSql()}`,
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
        `SELECT id FROM quiz_tasks WHERE theme_id = ? AND id IN (${questionIds.map(() => "?").join(", ")}) AND ${publishedQuizTaskSql()}`,
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
      `SELECT id FROM quiz_tasks WHERE theme_id = ? AND ${publishedQuizTaskSql()}`,
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

export type SaveBlockResult =
  | { ok: true; count: number }
  | { ok: false; reason: "locked" | "missing" | "too_many" | "invalid" };

type TaskOrderRow = { id: number; sort_order: number; question_id: number | null };

/**
 * The day's bank tasks become exactly `questionIds`, in that order.
 * Handwritten tasks stay after the block. If students already answered,
 * only a reorder of the same ids is allowed: row ids stay, so saved answers
 * still point at the same task.
 */
export async function replaceDayTaskBlock(
  dayId: number,
  questionIds: readonly number[],
  getConnection: Conn = loadDefaultConnection,
): Promise<SaveBlockResult> {
  const cleaned = cleanBlockIds(questionIds);
  if (!cleaned.ok) return cleaned;
  const ids = cleaned.ids;
  await ensureDays(getConnection);
  return withSql(async (connection) => {
    await connection.beginTransaction();
    try {
      const existing = await connection.query<TaskOrderRow>(
        `SELECT id, sort_order, question_id
         FROM marathon_day_tasks WHERE day_id = ? ORDER BY sort_order ASC, id ASC`,
        [dayId],
      );
      const answered = await connection.query<{ n: number | string }>(
        `SELECT COUNT(*) AS n FROM marathon_day_progress
         WHERE day_id = ? AND ${DAY_HAS_ANSWERS_SQL}`,
        [dayId],
      );
      const answers = Number(answered[0]?.n ?? 0);
      const bank = existing.filter((row) => row.question_id != null);
      const currentIds = bank.map((row) => Number(row.question_id));
      if (answers > 0 && !sameQuestionSet(currentIds, ids)) {
        await connection.rollback();
        return { ok: false, reason: "locked" };
      }
      if (ids.length > 0) {
        const found = await connection.query<{ id: number }>(
          `SELECT id FROM quiz_tasks
           WHERE id IN (${ids.map(() => "?").join(", ")}) AND ${publishedQuizTaskSql()}`,
          ids,
        );
        if (found.length !== ids.length) {
          await connection.rollback();
          return { ok: false, reason: "missing" };
        }
      }
      await connection.execute(
        `UPDATE marathon_day_tasks SET sort_order = -id WHERE day_id = ?`,
        [dayId],
      );
      if (answers > 0) {
        const byQuestion = new Map(bank.map((row) => [Number(row.question_id), Number(row.id)]));
        for (let index = 0; index < ids.length; index += 1) {
          await connection.execute(
            `UPDATE marathon_day_tasks SET sort_order = ? WHERE id = ? AND day_id = ?`,
            [index + 1, byQuestion.get(ids[index] ?? 0), dayId],
          );
        }
      } else if (bank.length > 0 || ids.length > 0) {
        await connection.execute(
          `DELETE FROM marathon_day_tasks WHERE day_id = ? AND question_id IS NOT NULL`,
          [dayId],
        );
        for (let index = 0; index < ids.length; index += 1) {
          await connection.execute(
            `INSERT INTO marathon_day_tasks
              (day_id, sort_order, question_id, inline_prompt, inline_options, inline_correct, inline_explanation)
             VALUES (?, ?, ?, NULL, NULL, NULL, NULL)`,
            [dayId, index + 1, ids[index]],
          );
        }
      }
      const inline = existing.filter((row) => row.question_id == null);
      for (let index = 0; index < inline.length; index += 1) {
        await connection.execute(
          `UPDATE marathon_day_tasks SET sort_order = ? WHERE id = ? AND day_id = ?`,
          [ids.length + index + 1, inline[index]?.id, dayId],
        );
      }
      await connection.commit();
      return { ok: true, count: ids.length };
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }, getConnection);
}

export const COPY_DAY_TASK_SQL = `
  UPDATE marathon_day_tasks
  SET question_id = NULL,
      inline_prompt = ?,
      inline_options = ?,
      inline_correct = ?,
      inline_explanation = ?
  WHERE id = ? AND day_id = ?
`;

/** What adding these bank ids would do. The bank row itself is never updated. */
export function planBankAdd(
  onThisDay: readonly number[],
  incoming: readonly number[],
  otherDays: ReadonlyMap<number, readonly number[]>,
): { add: number[]; duplicateHere: number[]; elsewhere: Array<{ id: number; days: number[] }> } {
  const here = new Set(onThisDay);
  const add: number[] = [];
  const duplicateHere: number[] = [];
  const elsewhere: Array<{ id: number; days: number[] }> = [];
  const seen = new Set<number>();
  for (const id of incoming) {
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    if (here.has(id)) {
      duplicateHere.push(id);
      continue;
    }
    add.push(id);
    const days = otherDays.get(id) ?? [];
    if (days.length > 0) elsewhere.push({ id, days: [...days] });
  }
  return { add, duplicateHere, elsewhere };
}

export function validateInlineEdit(input: {
  prompt: string;
  options: readonly string[];
  correct: number;
  explanation: string;
}): { ok: true; prompt: string; options: string[]; correct: number; explanation: string | null } | { ok: false; message: string } {
  const prompt = input.prompt.trim();
  const options = input.options.map((item) => item.trim()).filter((item) => item.length > 0);
  if (prompt.length < 2) return { ok: false, message: "Своє формулювання закоротке." };
  if (options.length < 2 || options.length > 4) {
    return { ok: false, message: "Свої варіанти — від 2 до 4." };
  }
  if (new Set(options).size !== options.length) {
    return { ok: false, message: "Варіанти відповіді не мають повторюватися." };
  }
  if (!Number.isInteger(input.correct) || input.correct < 1 || input.correct > options.length) {
    return { ok: false, message: "Номер правильної відповіді не входить у список варіантів." };
  }
  const explanation = input.explanation.trim();
  if (explanation.length > 4000) return { ok: false, message: "Пояснення довше за 4000 символів." };
  return { ok: true, prompt, options, correct: input.correct, explanation: explanation || null };
}

export async function addPublishedTasks(
  input: { marathonId: number; dayId: number; questionIds: readonly number[] },
  getConnection: Conn = loadDefaultConnection,
): Promise<
  | { ok: true; added: number; duplicateHere: number[]; elsewhere: Array<{ id: number; days: number[] }> }
  | { ok: false; reason: "locked" | "missing" }
> {
  const incoming = sanitizeIds(input.questionIds);
  await ensureDays(getConnection);
  return withSql(async (connection) => {
    const answered = await connection.query<{ n: number | string }>(
      `SELECT COUNT(*) AS n FROM marathon_day_progress
       WHERE day_id = ? AND ${DAY_HAS_ANSWERS_SQL}`,
      [input.dayId],
    );
    if (Number(answered[0]?.n ?? 0) > 0) return { ok: false, reason: "locked" };
    const hereRows = await connection.query<{ question_id: number }>(
      `SELECT question_id FROM marathon_day_tasks
       WHERE day_id = ? AND question_id IS NOT NULL`,
      [input.dayId],
    );
    const otherRows = incoming.length === 0
      ? []
      : await connection.query<{ question_id: number; day_number: number }>(
        `SELECT ot.question_id, d.day_number
         FROM marathon_day_tasks ot
         INNER JOIN marathon_days d ON d.id = ot.day_id
         WHERE d.marathon_id = ? AND ot.day_id <> ? AND ot.question_id IN (${incoming.map(() => "?").join(", ")})`,
        [input.marathonId, input.dayId, ...incoming],
      );
    const otherDays = new Map<number, number[]>();
    for (const row of otherRows) {
      const id = Number(row.question_id);
      const days = otherDays.get(id) ?? [];
      days.push(Number(row.day_number));
      otherDays.set(id, days);
    }
    const plan = planBankAdd(
      hereRows.map((row) => Number(row.question_id)),
      incoming,
      otherDays,
    );
    if (plan.add.length === 0) return { ok: true, added: 0, ...plan };
    const found = await connection.query<{ id: number }>(
      `SELECT id FROM quiz_tasks
       WHERE id IN (${plan.add.map(() => "?").join(", ")}) AND ${publishedQuizTaskSql()}`,
      plan.add,
    );
    if (found.length !== plan.add.length) return { ok: false, reason: "missing" };
    const maxRows = await connection.query<{ max_order: number | null }>(
      `SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM marathon_day_tasks WHERE day_id = ?`,
      [input.dayId],
    );
    let order = Number(maxRows[0]?.max_order ?? 0);
    for (const questionId of plan.add) {
      order += 1;
      await connection.execute(
        `INSERT INTO marathon_day_tasks
          (day_id, sort_order, question_id, inline_prompt, inline_options, inline_correct, inline_explanation)
         VALUES (?, ?, ?, NULL, NULL, NULL, NULL)`,
        [input.dayId, order, questionId],
      );
    }
    return { ok: true, added: plan.add.length, duplicateHere: plan.duplicateHere, elsewhere: plan.elsewhere };
  }, getConnection);
}

export async function moveDayTask(
  dayId: number,
  taskId: number,
  direction: -1 | 1,
  getConnection: Conn = loadDefaultConnection,
): Promise<boolean> {
  await ensureDays(getConnection);
  return withSql(async (connection) => {
    const rows = await connection.query<{ id: number; sort_order: number }>(
      `SELECT id, sort_order FROM marathon_day_tasks
       WHERE day_id = ? ORDER BY sort_order ASC, id ASC`,
      [dayId],
    );
    const index = rows.findIndex((row) => Number(row.id) === taskId);
    const target = index + direction;
    const current = rows[index];
    const neighbor = rows[target];
    if (!current || !neighbor) return false;
    await connection.execute(
      `UPDATE marathon_day_tasks SET sort_order = ? WHERE id = ? AND day_id = ?`,
      [-1, current.id, dayId],
    );
    await connection.execute(
      `UPDATE marathon_day_tasks SET sort_order = ? WHERE id = ? AND day_id = ?`,
      [current.sort_order, neighbor.id, dayId],
    );
    await connection.execute(
      `UPDATE marathon_day_tasks SET sort_order = ? WHERE id = ? AND day_id = ?`,
      [neighbor.sort_order, current.id, dayId],
    );
    return true;
  }, getConnection);
}

export async function saveTaskCopy(
  dayId: number,
  taskId: number,
  fields: { prompt: string; options: string[]; correct: number; explanation: string | null },
  getConnection: Conn = loadDefaultConnection,
): Promise<"saved" | "missing" | "locked"> {
  await ensureDays(getConnection);
  return withSql(async (connection) => {
    const answered = await connection.query<{ n: number | string }>(
      `SELECT COUNT(*) AS n FROM marathon_day_progress
       WHERE day_id = ? AND ${DAY_HAS_ANSWERS_SQL}`,
      [dayId],
    );
    if (Number(answered[0]?.n ?? 0) > 0) return "locked";
    const found = await connection.query<{ id: number }>(
      `SELECT id FROM marathon_day_tasks WHERE id = ? AND day_id = ? LIMIT 1`,
      [taskId, dayId],
    );
    if (!found[0]) return "missing";
    await connection.execute(COPY_DAY_TASK_SQL, [
      fields.prompt,
      JSON.stringify(fields.options),
      fields.correct,
      fields.explanation,
      taskId,
      dayId,
    ]);
    return "saved";
  }, getConnection);
}
function bankWhereParams(input: {
  themeId: number;
  difficulty: number;
  optionCount: number;
}): unknown[] {
  return [
    input.themeId,
    input.themeId,
    input.difficulty,
    input.difficulty,
    input.optionCount,
    input.optionCount,
    input.optionCount,
  ];
}

export async function searchBankTasks(
  input: {
    subject: string;
    themeId: number | null;
    query: string;
    difficulty?: number | null;
    optionCount?: 0 | 2 | 4;
    marathonId?: number;
    dayId?: number;
    page?: number;
  },
  getConnection?: Conn,
): Promise<BankSearchPage> {
  const empty = { tasks: [], total: 0, page: 1, pageSize: BANK_PAGE_SIZE };
  if (!quizBankMatchesSubject(input.subject)) return empty;
  const themeId = input.themeId != null && Number.isInteger(input.themeId) && input.themeId > 0
    ? input.themeId
    : 0;
  const difficulty = input.difficulty != null && Number.isInteger(input.difficulty) && input.difficulty > 0
    ? input.difficulty
    : 0;
  const optionCount = input.optionCount === 2 || input.optionCount === 4 ? input.optionCount : 0;
  const where = bankWhereParams({ themeId, difficulty, optionCount });
  const marathonId = input.marathonId != null && Number.isInteger(input.marathonId) ? input.marathonId : 0;
  const dayId = input.dayId != null && Number.isInteger(input.dayId) ? input.dayId : 0;
  const requested = Number.isInteger(input.page) && (input.page ?? 0) > 0 ? Number(input.page) : 1;
  return withSql(async (connection) => {
    const rows = await connection.query<
      PreviewRow & { name: string | null; theme_name: string | null; difficulty: number | null; other_days: string | null }
    >(BANK_SEARCH_SQL, [marathonId, dayId, ...where]);
    const matched = rows.flatMap((row) => {
      const preview = toBankPreview(row);
      if (!matchesBankQuery({
        id: preview.id,
        name: row.name ?? "",
        prompt: preview.prompt,
        query: input.query,
      })) return [];
      return [{
        ...preview,
        themeName: (row.theme_name ?? "").trim(),
        difficulty: Number(row.difficulty ?? 0),
        otherDays: (row.other_days ?? "")
          .split(",")
          .map((item) => Number(item))
          .filter((item) => Number.isInteger(item) && item > 0),
      }];
    });
    const pages = bankSearchPages(matched.length);
    const page = Math.min(requested, pages);
    const start = (page - 1) * BANK_PAGE_SIZE;
    return {
      total: matched.length,
      page,
      pageSize: BANK_PAGE_SIZE,
      tasks: matched.slice(start, start + BANK_PAGE_SIZE),
    };
  }, getConnection);
}
