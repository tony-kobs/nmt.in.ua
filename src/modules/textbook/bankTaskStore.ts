import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { normalizeNmtComment, normalizeNmtRichText } from "@/modules/testing/normalizeNmtRichText";
import { resolveNmtMatch } from "@/modules/testing/nmtMatch";
import { resolveTaskPresentation } from "@/modules/testing/taskPresentation";
import {
  bankExcerpt,
  bankOptionLetter,
  bankTaskToken,
  formatMatchAnswer,
  presentOpenAnswer,
  taskImageSrc,
  type BankKind,
  type BankTaskHit,
  type BankTaskMatch,
  type BankTaskOption,
  type BankTaskView,
} from "./bankTask";
import { safeImageSrc } from "./markup";

type Conn = () => Promise<SqlConnection>;

const SEARCH_LIMIT = 8;
const ID_CHUNK = 40;

type ChoiceRow = {
  id: number | string;
  name: string | null;
  task_text: string | null;
  answer_1: string | null;
  answer_2: string | null;
  answer_3: string | null;
  answer_4: string | null;
  answer_5?: string | null;
  right_answer_n: number | string | null;
  right_answer_text?: string | null;
  task_kind?: string | null;
  comments: string | null;
  theme_code?: string | null;
  theme_name?: string | null;
};

export type BankTaskLoad =
  | { ok: true; tasks: Record<string, BankTaskView>; missing: string[] }
  | { ok: false };

export type BankTaskSearch = { ok: true; hits: BankTaskHit[] } | { ok: false };

function numberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function presentPrompt(raw: string): { prompt: string; image: BankTaskView["image"] } {
  const normalized = normalizeNmtRichText(raw);
  const presentation = resolveTaskPresentation({ taskText: normalized });
  const visual = presentation.visual?.kind === "image" ? presentation.visual : null;
  const src = visual ? safeImageSrc(visual.src) ?? taskImageSrc(visual.src) : null;
  return {
    prompt: presentation.displayText,
    image: visual && src ? { src, alt: visual.alt || "Зображення до завдання" } : null,
  };
}

function answerAt(row: ChoiceRow, number: number): string {
  if (number === 1) return row.answer_1 ?? "";
  if (number === 2) return row.answer_2 ?? "";
  if (number === 3) return row.answer_3 ?? "";
  if (number === 4) return row.answer_4 ?? "";
  return row.answer_5 ?? "";
}

function optionsFrom(
  texts: readonly (string | null | undefined)[],
  correctNumber: number | null,
): BankTaskOption[] {
  const options: BankTaskOption[] = [];
  texts.forEach((text, index) => {
    const value = normalizeNmtRichText(text ?? "");
    if (!value) return;
    options.push({
      letter: bankOptionLetter(index),
      text: value,
      correct: correctNumber === index + 1,
    });
  });
  return options;
}

function explanationOf(raw: string | null, nmt: boolean): string | null {
  const text = (nmt ? normalizeNmtComment(raw) : normalizeNmtRichText(raw)).trim();
  return text || null;
}

function choiceView(bank: BankKind, row: ChoiceRow, nmt: boolean): BankTaskView {
  const id = Number(row.id);
  const shown = presentPrompt(row.task_text ?? "");
  const correct = numberOrNull(row.right_answer_n);
  const options = optionsFrom(
    [row.answer_1, row.answer_2, row.answer_3, row.answer_4, row.answer_5],
    correct,
  );
  const correctOption = options.find((option) => option.correct);
  return {
    ref: bankTaskToken(bank, id),
    bank,
    id,
    kind: "mcq",
    name: (row.name ?? "").trim(),
    prompt: shown.prompt,
    image: shown.image,
    options,
    match: null,
    answer: correctOption?.letter ?? null,
    explanation: explanationOf(row.comments, nmt),
  };
}

export function nmtRowToView(row: ChoiceRow): BankTaskView {
  const id = Number(row.id);
  const kind = row.task_kind === "match" || row.task_kind === "open" ? row.task_kind : "mcq";
  if (kind === "open") {
    const shown = presentPrompt(row.task_text ?? "");
    return {
      ref: bankTaskToken("nmt", id),
      bank: "nmt",
      id,
      kind: "open",
      name: (row.name ?? "").trim(),
      prompt: shown.prompt,
      image: shown.image,
      options: [],
      match: null,
      answer: presentOpenAnswer(row.right_answer_text),
      explanation: explanationOf(row.comments, true),
    };
  }
  if (kind === "match") {
    const resolved = resolveNmtMatch({
      name: row.name ?? "",
      taskText: row.task_text ?? "",
      taskKind: "match",
      answers: [1, 2, 3, 4, 5].map((number) => ({
        number,
        text: answerAt(row, number),
      })),
    });
    const shown = presentPrompt(resolved?.stem || row.task_text || "");
    const match: BankTaskMatch | null = resolved
      ? {
          leftTitle: resolved.match.leftTitle,
          rightTitle: resolved.match.rightTitle,
          left: resolved.match.left,
          right: resolved.match.right.map((option) => ({
            value: option.value,
            label: option.label,
            text: option.text,
          })),
        }
      : null;
    return {
      ref: bankTaskToken("nmt", id),
      bank: "nmt",
      id,
      kind: "match",
      name: (row.name ?? "").trim(),
      prompt: shown.prompt,
      image: shown.image,
      options: [],
      match,
      answer: formatMatchAnswer(row.right_answer_text),
      explanation: explanationOf(row.comments, true),
    };
  }
  return choiceView("nmt", row, true);
}

export function choiceRowToView(bank: "quiz" | "problem", row: ChoiceRow): BankTaskView {
  return choiceView(bank, row, false);
}

function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function hitFrom(bank: BankKind, row: ChoiceRow): BankTaskHit {
  const id = Number(row.id);
  const prompt = normalizeNmtRichText(row.task_text ?? "");
  const theme = (row.theme_code || row.theme_name || "").trim();
  const name = (row.name ?? "").trim();
  return {
    ref: bankTaskToken(bank, id),
    bank,
    id,
    name: name || `#${id}`,
    theme,
    excerpt: bankExcerpt(prompt || name),
  };
}

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

async function withSql<T>(
  fn: (connection: SqlConnection) => Promise<T>,
  getConnection: Conn,
): Promise<T | null> {
  try {
    const connection = await getConnection();
    try {
      return await fn(connection);
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("textbook bank tasks", error);
    return null;
  }
}

function chunks(ids: number[]): number[][] {
  const groups: number[][] = [];
  for (let index = 0; index < ids.length; index += ID_CHUNK) {
    groups.push(ids.slice(index, index + ID_CHUNK));
  }
  return groups;
}

const QUIZ_SQL = `SELECT q.id, q.name, q.task_text, q.answer_1, q.answer_2, q.answer_3, q.answer_4,
            q.right_answer_n, q.comments, t.code AS theme_code, t.name AS theme_name
     FROM quiz_tasks q
     LEFT JOIN themes t ON t.id = q.theme_id
     WHERE q.id IN `;

const PROBLEM_SQL = `SELECT p.id, p.name, p.problem_text AS task_text, p.answer_1, p.answer_2, p.answer_3, p.answer_4,
            p.right_answer_n, p.comments, t.code AS theme_code, t.name AS theme_name
     FROM problems p
     LEFT JOIN themes t ON t.id = p.theme_id
     WHERE p.id IN `;

const NMT_SQL = `SELECT q.id, q.name, q.task_text, q.answer_1, q.answer_2, q.answer_3, q.answer_4, q.answer_5,
            q.right_answer_n, q.right_answer_text, q.task_kind, q.comments,
            t.code AS theme_code, t.name AS theme_name
     FROM nmt_quiz_tasks q
     LEFT JOIN themes t ON t.id = q.theme_id
     WHERE q.id IN `;

async function loadIds(
  connection: SqlConnection,
  sql: string,
  ids: number[],
): Promise<ChoiceRow[]> {
  const rows: ChoiceRow[] = [];
  for (const group of chunks(ids)) {
    const marks = group.map(() => "?").join(", ");
    const found = await connection.query<ChoiceRow>(`${sql}(${marks})`, group);
    rows.push(...found);
  }
  return rows;
}

export async function loadBankTaskViews(
  refs: readonly { bank: BankKind; id: number }[],
  getConnection: Conn = loadDefaultConnection,
): Promise<BankTaskLoad> {
  const unique = new Map<string, { bank: BankKind; id: number }>();
  for (const ref of refs) {
    if (!Number.isInteger(ref.id) || ref.id < 1) continue;
    unique.set(bankTaskToken(ref.bank, ref.id), ref);
  }
  if (unique.size === 0) return { ok: true, tasks: {}, missing: [] };
  const byBank = (bank: BankKind) =>
    [...unique.values()].filter((ref) => ref.bank === bank).map((ref) => ref.id);

  const loaded = await withSql(async (connection) => {
    const tasks: Record<string, BankTaskView> = {};
    const quiz = await loadIds(connection, QUIZ_SQL, byBank("quiz"));
    for (const row of quiz) {
      const view = choiceRowToView("quiz", row);
      tasks[view.ref] = view;
    }
    const problems = await loadIds(connection, PROBLEM_SQL, byBank("problem"));
    for (const row of problems) {
      const view = choiceRowToView("problem", row);
      tasks[view.ref] = view;
    }
    const nmt = await loadIds(connection, NMT_SQL, byBank("nmt"));
    for (const row of nmt) {
      const view = nmtRowToView(row);
      tasks[view.ref] = view;
    }
    return tasks;
  }, getConnection);
  if (!loaded) return { ok: false };
  const missing = [...unique.keys()].filter((ref) => !loaded[ref]);
  return { ok: true, tasks: loaded, missing };
}

function searchSql(bank: BankKind): string {
  const textColumn = bank === "problem" ? "p.problem_text" : "q.task_text";
  const idColumn = bank === "problem" ? "p.id" : "q.id";
  const nameColumn = bank === "problem" ? "p.name" : "q.name";
  const from =
    bank === "quiz"
      ? `FROM quiz_tasks q LEFT JOIN themes t ON t.id = q.theme_id`
      : bank === "problem"
        ? `FROM problems p LEFT JOIN themes t ON t.id = p.theme_id`
        : `FROM nmt_quiz_tasks q LEFT JOIN themes t ON t.id = q.theme_id`;
  const select =
    bank === "nmt"
      ? `SELECT q.id, q.name, q.task_text, t.code AS theme_code, t.name AS theme_name`
      : bank === "problem"
        ? `SELECT p.id, p.name, p.problem_text AS task_text, t.code AS theme_code, t.name AS theme_name`
        : `SELECT q.id, q.name, q.task_text, t.code AS theme_code, t.name AS theme_name`;
  return `${select}
    ${from}
    WHERE CAST(${idColumn} AS CHAR) = ?
       OR ${nameColumn} LIKE ? ESCAPE '\\\\'
       OR ${textColumn} LIKE ? ESCAPE '\\\\'
       OR t.code LIKE ? ESCAPE '\\\\'
       OR t.name LIKE ? ESCAPE '\\\\'
    LIMIT ${SEARCH_LIMIT}`;
}

function rank(hit: BankTaskHit, query: string): number {
  const needle = query.toLowerCase();
  if (String(hit.id) === query) return 0;
  if (hit.theme.toLowerCase() === needle) return 1;
  if (hit.name.toLowerCase().startsWith(needle)) return 2;
  return 3;
}

export async function searchBankTasks(
  rawQuery: string,
  getConnection: Conn = loadDefaultConnection,
): Promise<BankTaskSearch> {
  const query = rawQuery.trim().slice(0, 80);
  if (!query) return { ok: true, hits: [] };
  if (query.length < 2 && !/^\d+$/.test(query)) return { ok: true, hits: [] };
  const pattern = likePattern(query);
  const params = [query, pattern, pattern, pattern, pattern];
  const found = await withSql(async (connection) => {
    const hits: BankTaskHit[] = [];
    for (const bank of ["quiz", "nmt", "problem"] as const) {
      const rows = await connection.query<ChoiceRow>(searchSql(bank), params);
      for (const row of rows) hits.push(hitFrom(bank, row));
    }
    return hits;
  }, getConnection);
  if (!found) return { ok: false };
  found.sort((a, b) => rank(a, query) - rank(b, query) || a.id - b.id);
  return { ok: true, hits: found.slice(0, 12) };
}
