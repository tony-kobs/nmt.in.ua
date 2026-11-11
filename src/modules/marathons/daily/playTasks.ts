/**
 * Student-facing marathon tasks.
 *
 * Before the day is submitted the client receives an allowlist: id, order,
 * prompt, options. The correct index and any explanation stay on the server
 * and are not selected by `PENDING_TASK_SQL`. After submit, `projectReviewedTask`
 * may include the participant's choice, the key, and the explanation.
 */

import { promptWithoutCopiedOptions } from "./promptOptions";
import { publishedQuizTaskSql } from "@/lib/publishedQuizTask";

export type PendingPlayTask = {
  id: number;
  order: number;
  prompt: string;
  options: string[];
};

export type ReviewedPlayTask = PendingPlayTask & {
  choice: number | null;
  correct: number;
  right: boolean;
  explanation: string | null;
};

export type TaskSourceRow = {
  id: number;
  sort_order: number;
  question_id?: number | null;
  inline_prompt?: string | null;
  inline_options?: string | null;
  inline_correct?: number | null;
  inline_explanation?: string | null;
  task_text?: string | null;
  answer_1?: string | null;
  answer_2?: string | null;
  answer_3?: string | null;
  answer_4?: string | null;
  right_answer_n?: number | null;
  comments?: string | null;
};

/** Columns a participant may see before they submit the day. */
export const PENDING_TASK_SQL = `
  SELECT t.id, t.sort_order, t.question_id, t.inline_prompt, t.inline_options,
         q.task_text, q.answer_1, q.answer_2, q.answer_3, q.answer_4
  FROM marathon_day_tasks t
  LEFT JOIN quiz_tasks q ON q.id = t.question_id
  WHERE t.day_id = ?
    AND (t.question_id IS NULL OR ${publishedQuizTaskSql("q")})
  ORDER BY t.sort_order
`;

/** Server-only: grading and the post-submit review. */
export const REVIEW_TASK_SQL = `
  SELECT t.id, t.sort_order, t.question_id, t.inline_prompt, t.inline_options,
         t.inline_correct, t.inline_explanation,
         q.task_text, q.answer_1, q.answer_2, q.answer_3, q.answer_4,
         q.right_answer_n, q.comments
  FROM marathon_day_tasks t
  LEFT JOIN quiz_tasks q ON q.id = t.question_id
  WHERE t.day_id = ?
    AND (t.question_id IS NULL OR ${publishedQuizTaskSql("q")})
  ORDER BY t.sort_order
`;

const PENDING_KEYS = ["id", "order", "prompt", "options"] as const;

function parseOptions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0,
    );
  } catch {
    return [];
  }
}

function bankOptions(row: TaskSourceRow): string[] {
  return [row.answer_1, row.answer_2, row.answer_3, row.answer_4].filter(
    (item): item is string => Boolean(item && item.trim()),
  );
}

function usesBank(row: TaskSourceRow): boolean {
  return Boolean(row.question_id && row.task_text && row.task_text.trim());
}

function cleanText(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text.length > 0 ? text : null;
}

type PlayBase = {
  id: number;
  order: number;
  prompt: string;
  options: string[];
  questionId: number | null;
};

function readBase(row: TaskSourceRow): PlayBase | null {
  if (usesBank(row)) {
    const options = bankOptions(row);
    if (options.length < 2 || !row.task_text) return null;
    return {
      id: row.id,
      order: row.sort_order,
      prompt: promptWithoutCopiedOptions(row.task_text, options),
      options,
      questionId: row.question_id ?? null,
    };
  }
  const options = parseOptions(row.inline_options);
  const prompt = cleanText(row.inline_prompt);
  if (!prompt || options.length < 2) return null;
  return {
    id: row.id,
    order: row.sort_order,
    prompt: promptWithoutCopiedOptions(prompt, options),
    options,
    questionId: null,
  };
}

function correctIndex(row: TaskSourceRow, base: PlayBase): number | null {
  const raw = base.questionId ? row.right_answer_n : row.inline_correct;
  const correct = Number(raw);
  if (!Number.isInteger(correct) || correct < 1 || correct > base.options.length) {
    return null;
  }
  return correct;
}

/** Allowlisted object. Extra columns on the row are dropped. */
export function projectPendingTask(row: TaskSourceRow): PendingPlayTask | null {
  const base = readBase(row);
  if (!base) return null;
  const task: PendingPlayTask = {
    id: base.id,
    order: base.order,
    prompt: base.prompt,
    options: base.options,
  };
  const keys = Object.keys(task);
  if (keys.length !== PENDING_KEYS.length || keys.some((key) => !PENDING_KEYS.includes(key as (typeof PENDING_KEYS)[number]))) {
    return null;
  }
  return task;
}

export function projectReviewedTask(
  row: TaskSourceRow,
  answers: Record<number, number>,
): ReviewedPlayTask | null {
  const base = readBase(row);
  if (!base) return null;
  const correct = correctIndex(row, base);
  if (correct == null) return null;
  const choiceRaw = answers[base.id];
  const choice =
    Number.isInteger(choiceRaw) && choiceRaw >= 1 && choiceRaw <= base.options.length
      ? choiceRaw
      : null;
  const explanation = cleanText(
    base.questionId ? row.comments : row.inline_explanation,
  );
  return {
    id: base.id,
    order: base.order,
    prompt: base.prompt,
    options: base.options,
    choice,
    correct,
    right: choice === correct,
    explanation,
  };
}

export function parseStoredAnswers(raw: unknown): Record<number, number> {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const answers: Record<number, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const id = Number(key);
      const choice = Number(value);
      if (Number.isInteger(id) && id > 0 && Number.isInteger(choice) && choice > 0) {
        answers[id] = choice;
      }
    }
    return answers;
  } catch {
    return {};
  }
}

/**
 * What `MarathonDayView` is allowed to receive.
 * An unsubmitted day never forwards the review, even if the caller loaded it.
 */
export function dayClientPayload(input: {
  submitted: boolean;
  pending: PendingPlayTask[];
  review: ReviewedPlayTask[];
}): { tasks: PendingPlayTask[]; review: ReviewedPlayTask[] } {
  if (!input.submitted) {
    return { tasks: input.pending, review: [] };
  }
  return { tasks: [], review: input.review };
}
