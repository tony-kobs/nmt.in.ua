import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import {
  PENDING_TASK_SQL,
  projectPendingTask,
  projectReviewedTask,
  REVIEW_TASK_SQL,
  type PendingPlayTask,
  type ReviewedPlayTask,
  type TaskSourceRow,
} from "../playTasks";
import { promptWithoutCopiedOptions } from "../promptOptions";
import { withConn, type Conn } from "./db";
import type { PlayTask } from "./types";

export async function loadReviewRows(
  connection: SqlConnection,
  dayId: number,
): Promise<TaskSourceRow[]> {
  return connection.query<TaskSourceRow>(REVIEW_TASK_SQL, [dayId]);
}

/** Prompt and options only. Does not select the key or the explanation. */
export async function listPendingTasks(
  dayId: number,
  getConnection?: Conn,
): Promise<PendingPlayTask[]> {
  return withConn(async (connection) => {
    const rows = await connection.query<TaskSourceRow>(PENDING_TASK_SQL, [dayId]);
    return rows.flatMap((row) => {
      const task = projectPendingTask(row);
      return task ? [task] : [];
    });
  }, getConnection);
}

export async function listTaskReview(
  dayId: number,
  answers: Record<number, number>,
  getConnection?: Conn,
): Promise<ReviewedPlayTask[]> {
  return withConn(async (connection) => {
    const rows = await loadReviewRows(connection, dayId);
    return rows.flatMap((row) => {
      const task = projectReviewedTask(row, answers);
      return task ? [task] : [];
    });
  }, getConnection);
}

export async function listAdminTasks(
  dayId: number,
  getConnection?: Conn,
): Promise<Array<PlayTask & { correct: number; questionId: number | null }>> {
  return withConn(async (connection) => {
    const rows = await loadReviewRows(connection, dayId);
    return rows.flatMap((row) => {
      const task = projectReviewedTask(row, {});
      if (!task) {
        return [{
          id: row.id,
          order: row.sort_order,
          prompt: row.inline_prompt || row.task_text || `Завдання #${row.question_id ?? row.id}`,
          options: [],
          correct: Number(row.inline_correct ?? row.right_answer_n ?? 0),
          questionId: row.question_id ?? null,
        }];
      }
      return [{
        id: task.id,
        order: task.order,
        prompt: task.prompt,
        options: task.options,
        correct: task.correct,
        questionId: row.question_id ?? null,
      }];
    });
  }, getConnection);
}

export async function insertTask(
  dayId: number,
  input: {
    order: number;
    questionId: number | null;
    prompt: string | null;
    options: string[] | null;
    correct: number | null;
    explanation?: string | null;
  },
  getConnection?: Conn,
): Promise<void> {
  const prompt = input.prompt == null
    ? null
    : promptWithoutCopiedOptions(input.prompt, input.options ?? []) || null;
  await withConn(async (connection) => {
    await connection.execute(
      `INSERT INTO marathon_day_tasks
        (day_id, sort_order, question_id, inline_prompt, inline_options, inline_correct, inline_explanation)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        dayId,
        input.order,
        input.questionId,
        prompt,
        input.options ? JSON.stringify(input.options) : null,
        input.correct,
        input.explanation?.trim() || null,
      ],
    );
  }, getConnection);
}

export async function deleteTask(
  dayId: number,
  taskId: number,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `DELETE FROM marathon_day_tasks WHERE id = ? AND day_id = ?`,
      [taskId, dayId],
    );
  }, getConnection);
}

export async function quizTaskExists(
  id: number,
  getConnection?: Conn,
): Promise<boolean> {
  if (!Number.isInteger(id) || id <= 0) return false;
  return withConn(async (connection) => {
    const rows = await connection.query<{ id: number }>(
      `SELECT id FROM quiz_tasks WHERE id = ? LIMIT 1`,
      [id],
    );
    return Boolean(rows[0]);
  }, getConnection);
}

export async function searchQuizTasks(
  query: string,
  getConnection?: Conn,
): Promise<Array<{ id: number; label: string }>> {
  const term = query.trim().slice(0, 80);
  if (!term) return [];
  const like = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
  return withConn(async (connection) => {
    const rows = await connection.query<{ id: number; name: string | null; task_text: string }>(
      `SELECT id, name, task_text FROM quiz_tasks
       WHERE CAST(id AS CHAR) = ? OR name LIKE ? ESCAPE '\\\\' OR task_text LIKE ? ESCAPE '\\\\'
       ORDER BY id DESC LIMIT 12`,
      [term, like, like],
    );
    return rows.map((row) => ({
      id: row.id,
      label: `${row.id}. ${(row.name || row.task_text).slice(0, 120)}`,
    }));
  }, getConnection);
}
