import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { deriveTaskName } from "@/modules/admin-content/validate";
import {
  parseTopicTaskCsv,
  parseTopicTaskExcel,
  parseTopicTaskJson,
  planTopicTasks,
  topicTasksToCsv,
  topicTasksToExcel,
  topicTasksToJson,
  type ParsedTopicRow,
  type StoredTopicTask,
  type TopicParamSpec,
  type TopicTaskPlan,
} from "./topicTaskFile";

type Conn = () => Promise<SqlConnection>;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

export type TopicTaskSnapshot = {
  params: TopicParamSpec[];
  tasks: StoredTopicTask[];
  foreignIds: Map<number, number>;
  protectedIds: Map<number, string>;
};

function reasonText(kind: string): string {
  if (kind === "marathon") return "Є в дні марафону.";
  if (kind === "answers") return "Є відповіді учнів.";
  return "Є в навчальній сесії.";
}

async function readSnapshot(connection: SqlConnection, themeId: number): Promise<TopicTaskSnapshot | null> {
    const themes = await connection.query<{ id: number }>(
      `SELECT id FROM themes WHERE id = ? LIMIT 1`,
      [themeId],
    );
    if (!themes[0]) return null;
    const paramRows = await connection.query<{ code: string; value_type: string }>(
      `SELECT code, value_type FROM theme_params WHERE theme_id = ? ORDER BY sort ASC, id ASC`,
      [themeId],
    );
    const params: TopicParamSpec[] = paramRows.map((row) => ({
      code: row.code,
      valueType: row.value_type === "bool" ? "bool" : "int",
    }));
    const taskRows = await connection.query<{
      id: number;
      name: string | null;
      task_text: string | null;
      answer_1: string | null;
      answer_2: string | null;
      answer_3: string | null;
      answer_4: string | null;
      right_answer_n: number | null;
      comments: string | null;
      difficulty: number | null;
      status: string | null;
      hint_short: string | null;
    }>(
      `SELECT id, name, task_text, answer_1, answer_2, answer_3, answer_4,
              right_answer_n, comments, difficulty, status, hint_short
       FROM quiz_tasks WHERE theme_id = ? ORDER BY id ASC`,
      [themeId],
    );
    const markRows = await connection.query<{ task_id: number; code: string; int_value: number }>(
      `SELECT v.task_id, p.code, v.int_value
       FROM quiz_task_params v
       INNER JOIN theme_params p ON p.id = v.param_id
       INNER JOIN quiz_tasks q ON q.id = v.task_id
       WHERE q.theme_id = ?`,
      [themeId],
    );
    const marks = new Map<number, Record<string, number | null>>();
    for (const mark of markRows) {
      const bag = marks.get(Number(mark.task_id)) ?? {};
      bag[mark.code] = Number(mark.int_value);
      marks.set(Number(mark.task_id), bag);
    }
    const tasks: StoredTopicTask[] = taskRows.map((row) => ({
      id: Number(row.id),
      name: row.name ?? "",
      taskText: row.task_text ?? "",
      answer1: row.answer_1 ?? "",
      answer2: row.answer_2 ?? "",
      answer3: row.answer_3 ?? "",
      answer4: row.answer_4 ?? "",
      rightAnswerN: Number(row.right_answer_n ?? 1),
      comments: row.comments ?? "",
      difficulty: Number(row.difficulty ?? 1),
      status: row.status === "draft" ? "draft" : "published",
      hintShort: row.hint_short ?? "",
      params: marks.get(Number(row.id)) ?? {},
    }));
    const guardRows = await connection.query<{ id: number; kind: string }>(
      `SELECT q.id, 'marathon' AS kind
       FROM quiz_tasks q
       INNER JOIN marathon_day_tasks t ON t.question_id = q.id
       WHERE q.theme_id = ?
       UNION
       SELECT q.id, 'answers' AS kind
       FROM quiz_tasks q
       INNER JOIN tasks2session s ON s.task_id = q.id AND s.task_type = 1
       WHERE q.theme_id = ?
       UNION
       SELECT q.id, 'session' AS kind
       FROM quiz_tasks q
       INNER JOIN session_tasks st ON st.quiz_task_id = q.id
       WHERE q.theme_id = ?`,
      [themeId, themeId, themeId],
    );
    const protectedIds = new Map<number, string>();
    for (const row of guardRows) {
      const id = Number(row.id);
      const text = reasonText(row.kind);
      const previous = protectedIds.get(id);
      protectedIds.set(id, previous ? `${previous} ${text}` : text);
    }
    return { params, tasks, foreignIds: new Map(), protectedIds };
}

export async function loadTopicTaskSnapshot(
  themeId: number,
  getConnection: Conn = loadDefaultConnection,
): Promise<TopicTaskSnapshot | null> {
  const connection = await getConnection();
  try {
    return await readSnapshot(connection, themeId);
  } finally {
    connection.release();
  }
}

async function foreignIds(
  connection: SqlConnection,
  themeId: number,
  ids: number[],
): Promise<Map<number, number>> {
  if (ids.length === 0) return new Map();
  const rows = await connection.query<{ id: number; theme_id: number }>(
    `SELECT id, theme_id FROM quiz_tasks WHERE id IN (${ids.map(() => "?").join(", ")}) AND theme_id <> ?`,
    [...ids, themeId],
  );
  return new Map(rows.map((row) => [Number(row.id), Number(row.theme_id)]));
}

export async function readTopicTaskFile(
  name: string,
  bytes: Uint8Array,
  params: readonly TopicParamSpec[],
): Promise<{ rows: ParsedTopicRow[]; errors: TopicTaskPlan["errors"] }> {
  const lower = name.toLowerCase();
  if (lower.endsWith(".json")) return parseTopicTaskJson(new TextDecoder().decode(bytes), params);
  if (lower.endsWith(".xlsx")) return parseTopicTaskExcel(bytes, params);
  return parseTopicTaskCsv(new TextDecoder().decode(bytes), params);
}

export async function previewTopicTaskFile(
  themeId: number,
  name: string,
  bytes: Uint8Array,
  deleteMissing: boolean,
  getConnection?: Conn,
): Promise<TopicTaskPlan | null> {
  const snapshot = await loadTopicTaskSnapshot(themeId, getConnection);
  if (!snapshot) return null;
  const parsed = await readTopicTaskFile(name, bytes, snapshot.params);
  const connection = await (getConnection ?? loadDefaultConnection)();
  try {
    const ids = parsed.rows.flatMap((row) => (row.id == null ? [] : [row.id]));
    const foreign = await foreignIds(connection, themeId, ids);
    return planTopicTasks({
      rows: parsed.rows,
      parseErrors: parsed.errors,
      current: snapshot.tasks,
      foreignIds: foreign,
      protectedIds: snapshot.protectedIds,
      deleteMissing,
    });
  } finally {
    connection.release();
  }
}

export async function applyTopicTaskFile(
  themeId: number,
  name: string,
  bytes: Uint8Array,
  deleteMissing: boolean,
  getConnection: Conn = loadDefaultConnection,
): Promise<TopicTaskPlan | null> {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const snapshot = await readSnapshot(connection, themeId);
    if (!snapshot) {
      await connection.rollback();
      return null;
    }
    const parsed = await readTopicTaskFile(name, bytes, snapshot.params);
    const ids = parsed.rows.flatMap((row) => (row.id == null ? [] : [row.id]));
    const foreign = await foreignIds(connection, themeId, ids);
    const plan = planTopicTasks({
      rows: parsed.rows,
      parseErrors: parsed.errors,
      current: snapshot.tasks,
      foreignIds: foreign,
      protectedIds: snapshot.protectedIds,
      deleteMissing,
    });
    if (plan.errors.length > 0 || !snapshot) {
      await connection.rollback();
      return plan;
    }
    const nextRows = await connection.query<{ next_id: number | string }>(
      `SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM quiz_tasks`,
    );
    let nextId = Number(nextRows[0]?.next_id ?? 1);
    const paramIds = await connection.query<{ id: number; code: string }>(
      `SELECT id, code FROM theme_params WHERE theme_id = ?`,
      [themeId],
    );
    const paramIdByCode = new Map(paramIds.map((row) => [row.code, Number(row.id)]));
    for (const row of plan.create) {
      const nameText = row.fields.name || deriveTaskName(row.fields.taskText);
      await connection.execute(
        `INSERT INTO quiz_tasks
          (id, name, task_text, theme_id, answer_1, answer_2, answer_3, answer_4,
           right_answer_n, comments, difficulty, hint_short, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          nextId,
          nameText,
          row.fields.taskText,
          themeId,
          row.fields.answer1,
          row.fields.answer2,
          row.fields.answer3,
          row.fields.answer4,
          row.fields.rightAnswerN,
          row.fields.comments,
          row.fields.difficulty,
          row.fields.hintShort || null,
          row.fields.status,
        ],
      );
      await writeParams(connection, nextId, row.fields.params, paramIdByCode);
      nextId += 1;
    }
    for (const row of plan.update) {
      if (row.id == null) continue;
      await connection.execute(
        `UPDATE quiz_tasks
         SET name = ?, task_text = ?, answer_1 = ?, answer_2 = ?, answer_3 = ?, answer_4 = ?,
             right_answer_n = ?, comments = ?, difficulty = ?, hint_short = ?, status = ?
         WHERE id = ? AND theme_id = ?`,
        [
          row.fields.name,
          row.fields.taskText,
          row.fields.answer1,
          row.fields.answer2,
          row.fields.answer3,
          row.fields.answer4,
          row.fields.rightAnswerN,
          row.fields.comments,
          row.fields.difficulty,
          row.fields.hintShort || null,
          row.fields.status,
          row.id,
          themeId,
        ],
      );
      await writeParams(connection, row.id, row.fields.params, paramIdByCode);
    }
    for (const id of plan.deleteIds) {
      const still = await connection.query<{ id: number }>(
        `SELECT q.id FROM quiz_tasks q
         WHERE q.id = ? AND q.theme_id = ?
           AND NOT EXISTS (SELECT 1 FROM marathon_day_tasks t WHERE t.question_id = q.id)
           AND NOT EXISTS (SELECT 1 FROM tasks2session s WHERE s.task_id = q.id AND s.task_type = 1)
           AND NOT EXISTS (SELECT 1 FROM session_tasks st WHERE st.quiz_task_id = q.id)
         LIMIT 1`,
        [id, themeId],
      );
      if (!still[0]) continue;
      await connection.execute(`DELETE FROM quiz_task_params WHERE task_id = ?`, [id]);
      await connection.execute(`DELETE FROM quiz_tasks WHERE id = ? AND theme_id = ?`, [id, themeId]);
    }
    await connection.commit();
    return plan;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function writeParams(
  connection: SqlConnection,
  taskId: number,
  params: Record<string, number | null> | null,
  paramIdByCode: Map<string, number>,
): Promise<void> {
  if (!params) return;
  for (const [code, value] of Object.entries(params)) {
    const paramId = paramIdByCode.get(code);
    if (!paramId) continue;
    if (value == null) {
      await connection.execute(
        `DELETE FROM quiz_task_params WHERE task_id = ? AND param_id = ?`,
        [taskId, paramId],
      );
      continue;
    }
    await connection.execute(
      `INSERT INTO quiz_task_params (task_id, param_id, int_value) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE int_value = VALUES(int_value)`,
      [taskId, paramId, value],
    );
  }
}

export async function exportTopicTasks(
  themeId: number,
  format: "csv" | "json" | "xlsx",
  getConnection?: Conn,
): Promise<{ filename: string; body: Uint8Array; contentType: string } | null> {
  const snapshot = await loadTopicTaskSnapshot(themeId, getConnection);
  if (!snapshot) return null;
  if (format === "json") {
    return {
      filename: `theme-${themeId}-tasks.json`,
      contentType: "application/json; charset=utf-8",
      body: new TextEncoder().encode(topicTasksToJson(snapshot.tasks, snapshot.params)),
    };
  }
  if (format === "xlsx") {
    return {
      filename: `theme-${themeId}-tasks.xlsx`,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body: await topicTasksToExcel(snapshot.tasks, snapshot.params),
    };
  }
  return {
    filename: `theme-${themeId}-tasks.csv`,
    contentType: "text/csv; charset=utf-8",
    body: new TextEncoder().encode(topicTasksToCsv(snapshot.tasks, snapshot.params)),
  };
}
