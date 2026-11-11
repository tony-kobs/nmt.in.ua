import type { SqlConnection } from "@/lib/db/mysql";
import { MIN_DIFFICULTY } from "@/modules/content-import/schema";
import {
  loadThemeLevels,
  loadThemeTaskInventory,
} from "./themeLevels";
import {
  loadTaskParamValues,
  loadThemeParams,
  replaceQuizTaskParams,
} from "./themeParams";
import {
  AdminContentError,
  ADMIN_TASKS_PAGE_SIZE,
  MAX_DIFFICULTY_GUIDE_LENGTH,
  type AdminQuizTask,
  type AdminQuizTaskInput,
  type AdminQuizTaskListItem,
  type AdminQuizTaskListPage,
  type AdminThemeOption,
  type QuizTaskStatus,
  type TaskParamValue,
} from "./types";
import type { GeneratedDraft } from "./generateSimilar";

/** Default legend for every theme that has not been edited yet. */
const DEFAULT_DIFFICULTY_GUIDE = `1. Додавання однозначних чисел.
2. Додавання та віднімання чисел в межах 10.
3. Множення чисел в межах 10.
4. Додавання та віднімання чисел в межах 100 (таблиця додавання/віднімання)
5. Множення однозначних чисел між собою (таблиця множення/ділення однозначних чисел).
6. Операції із числами в межах 1000.
7. Ділення чисел на числа типу 10,100,1000,10000 із утворенням десяткових дробів.`;

const SQL_ADMIN_THEMES = `
  SELECT t.id, t.code, t.name, t.ord,
    ANY_VALUE(t.difficulty_guide) AS difficulty_guide,
    COUNT(q.id) AS task_count
  FROM themes t
  LEFT JOIN quiz_tasks q ON q.theme_id = t.id
  GROUP BY t.id, t.code, t.name, t.ord
  ORDER BY t.ord ASC, t.id ASC
`;

const SQL_GUIDE_COLUMN = `
  SELECT COLUMN_NAME AS COLUMN_NAME
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'themes'
    AND COLUMN_NAME = 'difficulty_guide'
`;

const SQL_SEED_DIFFICULTY_GUIDE = `
  UPDATE themes
  SET difficulty_guide = ?
  WHERE difficulty_guide IS NULL
`;

const SQL_UPDATE_GUIDE = `
  UPDATE themes
  SET difficulty_guide = ?
  WHERE id = ?
`;

const SQL_THEME_EXISTS = `SELECT id FROM themes WHERE id = ? LIMIT 1`;

/**
 * The admin list is the theme bank, paged and optionally narrowed by search
 * and status. Student hand-out is the published subset of the same theme.
 * It does not add generators, workbook `problems`, or other themes.
 */
const SQL_LIST_BY_THEME = `
  SELECT q.id, q.name, q.task_text, q.difficulty, q.status, q.source_task_id,
    EXISTS (
      SELECT 1 FROM tasks2session s
      WHERE s.task_id = q.id AND s.task_type = 1
    ) AS in_use
  FROM quiz_tasks q
  WHERE q.theme_id = ?
`;

const SQL_COUNT_BY_THEME = `
  SELECT COUNT(*) AS total
  FROM quiz_tasks q
  WHERE q.theme_id = ?
`;

const SEARCH_MAX = 80;

/** LIKE fragment for the admin list. Empty search keeps the full theme bank. */
/** `all` keeps drafts and published rows. Anything else is ignored. */
export function themeTaskStatusClause(status: string): { sql: string; params: string[] } {
  if (status === "draft" || status === "published") {
    return { sql: " AND q.status = ?", params: [status] };
  }
  return { sql: "", params: [] };
}

export function themeTaskSearchClause(raw: string): { sql: string; params: string[] } {
  const trimmed = raw.trim().slice(0, SEARCH_MAX);
  if (!trimmed) return { sql: "", params: [] };
  const escaped = trimmed.replace(/[\\%_]/g, (char) => `\\${char}`);
  const like = `%${escaped}%`;
  return {
    sql: " AND (q.name LIKE ? ESCAPE '\\\\' OR q.task_text LIKE ? ESCAPE '\\\\')",
    params: [like, like],
  };
}

const SQL_NEIGHBOR_IDS = `
  SELECT
    (SELECT id FROM quiz_tasks
     WHERE theme_id = ? AND id < ?
     ORDER BY id DESC LIMIT 1) AS prev_id,
    (SELECT id FROM quiz_tasks
     WHERE theme_id = ? AND id > ?
     ORDER BY id ASC LIMIT 1) AS next_id
`;

const SQL_GET_BY_ID = `
  SELECT id, name, task_text, theme_id, answer_1, answer_2, answer_3, answer_4,
         right_answer_n, comments, difficulty, hint_short, status, source_task_id
  FROM quiz_tasks
  WHERE id = ?
  LIMIT 1
`;

const SQL_NEXT_ID = `SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM quiz_tasks`;

const SQL_INSERT = `
  INSERT INTO quiz_tasks
    (id, name, task_text, theme_id, answer_1, answer_2, answer_3, answer_4,
     right_answer_n, comments, difficulty, hint_short)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const SQL_INSERT_DRAFT = `
  INSERT INTO quiz_tasks
    (id, name, task_text, theme_id, answer_1, answer_2, answer_3, answer_4,
     right_answer_n, comments, difficulty, hint_short, status, source_task_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
`;

const SQL_PUBLISH = `
  UPDATE quiz_tasks
  SET status = 'published'
  WHERE id = ?
`;

const SQL_UPDATE = `
  UPDATE quiz_tasks
  SET name = ?, task_text = ?, theme_id = ?,
      answer_1 = ?, answer_2 = ?, answer_3 = ?, answer_4 = ?,
      right_answer_n = ?, comments = ?, difficulty = ?, hint_short = ?
  WHERE id = ?
`;

const SQL_UPDATE_DIFFICULTY = `
  UPDATE quiz_tasks
  SET difficulty = ?
  WHERE id = ?
`;

const SQL_DELETE = `DELETE FROM quiz_tasks WHERE id = ?`;

/** Topic-bank rows only. The same numeric id can belong to an NMT task. */
const SQL_SESSION_IDS_FOR_TASK = `
  SELECT DISTINCT session_id
  FROM tasks2session
  WHERE task_id = ? AND task_type = 1
`;

const SQL_DELETE_SESSION_LINKS = `
  DELETE FROM tasks2session
  WHERE task_id = ? AND task_type = 1
`;

/**
 * After a bank task leaves a session, stored totals must match the rows
 * that remain. Follow-ups (`practice_task_origin`) stay out of the score,
 * same as `finishTrainerSession`. A session with no rows left becomes 0/0.
 */
function sqlRecalculateSessions(sessionIds: number[]): string {
  const list = sessionIds.join(",");
  return `
    UPDATE task_sessions ts
    LEFT JOIN (
      SELECT t2s.session_id,
        SUM(po.tasks2session_id IS NULL) AS tasks_number,
        SUM(
          po.tasks2session_id IS NULL
          AND COALESCE(t2s.first_attempt_status, t2s.status) = 1
        ) AS right_number
      FROM tasks2session t2s
      LEFT JOIN practice_task_origin po ON po.tasks2session_id = t2s.id
      WHERE t2s.session_id IN (${list})
      GROUP BY t2s.session_id
    ) agg ON agg.session_id = ts.id
    SET ts.tasks_number = COALESCE(agg.tasks_number, 0),
        ts.right_number = COALESCE(agg.right_number, 0)
    WHERE ts.id IN (${list})
  `;
}

type ThemeRow = {
  id: number;
  code: string;
  name: string;
  ord: number;
  difficulty_guide: string | null;
  task_count: number | string;
};

type ListRow = {
  id: number;
  name: string;
  task_text: string;
  difficulty: number;
  in_use: number | string | boolean;
  status?: string | null;
  source_task_id?: number | string | null;
};

type TaskRow = {
  id: number;
  name: string;
  task_text: string;
  theme_id: number;
  answer_1: string;
  answer_2: string;
  answer_3: string;
  answer_4: string;
  right_answer_n: number;
  comments: string | null;
  difficulty: number;
  hint_short?: string | null;
  status?: string | null;
  source_task_id?: number | string | null;
};

function readStatus(value: string | null | undefined): QuizTaskStatus {
  return value === "draft" ? "draft" : "published";
}

function readSourceId(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function mapTask(row: TaskRow, params: TaskParamValue[]): AdminQuizTask {
  const right = row.right_answer_n;
  if (right !== 1 && right !== 2 && right !== 3 && right !== 4) {
    throw new AdminContentError("Corrupt right_answer_n.", "db_error");
  }
  return {
    id: row.id,
    name: row.name.trim(),
    taskText: row.task_text,
    themeId: row.theme_id,
    answer1: row.answer_1,
    answer2: row.answer_2,
    answer3: row.answer_3,
    answer4: row.answer_4,
    rightAnswerN: right,
    comments: (row.comments ?? "").trim(),
    difficulty: row.difficulty,
    params,
    status: readStatus(row.status),
    sourceTaskId: readSourceId(row.source_task_id),
    hintShort: (row.hint_short ?? "").trim(),
  };
}

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

let difficultyGuideReady: Promise<void> | undefined;

async function ensureDifficultyGuideColumn(
  getConnection: () => Promise<SqlConnection>,
): Promise<void> {
  if (!difficultyGuideReady) {
    difficultyGuideReady = (async () => {
      const connection = await getConnection();
      try {
        const rows = await connection.query<{
          COLUMN_NAME?: string;
          column_name?: string;
        }>(SQL_GUIDE_COLUMN, []);
        const present = rows.some(
          (row) =>
            String(row.COLUMN_NAME ?? row.column_name ?? "") ===
            "difficulty_guide",
        );
        if (!present) {
          try {
            await connection.execute(
              `ALTER TABLE themes ADD COLUMN difficulty_guide TEXT NULL`,
              [],
            );
          } catch (error) {
            const errno = (error as { errno?: number }).errno;
            // Another process added the column between the check and ALTER.
            if (errno !== 1060) throw error;
          }
        }
        await connection.execute(SQL_SEED_DIFFICULTY_GUIDE, [
          DEFAULT_DIFFICULTY_GUIDE,
        ]);
      } finally {
        connection.release();
      }
    })().catch((error: unknown) => {
      difficultyGuideReady = undefined;
      throw error;
    });
  }
  await difficultyGuideReady;
}

export async function getAdminThemes(
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<AdminThemeOption[]> {
  await ensureDifficultyGuideColumn(deps.getConnection);
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<ThemeRow>(SQL_ADMIN_THEMES, []);
    const params = await loadThemeParams(connection);
    const levels = await loadThemeLevels(connection);
    const inventory = await loadThemeTaskInventory(connection);
    const paramsByTheme = new Map<number, AdminThemeOption["params"]>();
    for (const param of params) {
      const list = paramsByTheme.get(param.themeId);
      if (list) list.push(param);
      else paramsByTheme.set(param.themeId, [param]);
    }
    const levelsByTheme = new Map<number, AdminThemeOption["levels"]>();
    for (const level of levels) {
      const list = levelsByTheme.get(level.themeId);
      if (list) list.push(level);
      else levelsByTheme.set(level.themeId, [level]);
    }
    return rows.map((row) => {
      const taskIds = inventory.taskIdsByTheme.get(row.id) ?? [];
      const idSet = new Set(taskIds);
      return {
        id: row.id,
        code: row.code?.trim() ?? "",
        name: row.name?.trim() ?? "",
        ord: row.ord,
        taskCount: Number(row.task_count),
        difficultyGuide: (row.difficulty_guide ?? "").trim(),
        params: paramsByTheme.get(row.id) ?? [],
        levels: levelsByTheme.get(row.id) ?? [],
        taskIds,
        marks: inventory.marks.filter((mark) => idSet.has(mark.taskId)),
      };
    });
  } finally {
    connection.release();
  }
}

export async function updateThemeDifficultyGuide(
  themeId: number,
  guide: string,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<void> {
  const text = guide.trim();
  if (
    !Number.isInteger(themeId) ||
    themeId <= 0 ||
    text.length > MAX_DIFFICULTY_GUIDE_LENGTH
  ) {
    throw new AdminContentError("Invalid difficulty guide.", "invalid_input");
  }

  await ensureDifficultyGuideColumn(deps.getConnection);
  const connection = await deps.getConnection();
  try {
    const result = await connection.execute(SQL_UPDATE_GUIDE, [text, themeId]);
    // MySQL reports 0 when the text is already stored. That is a successful save.
    if (result.affectedRows === 0) {
      const existing = await connection.query<{ id: number }>(SQL_THEME_EXISTS, [
        themeId,
      ]);
      if (!existing[0]) {
        throw new AdminContentError("Theme not found.", "not_found");
      }
    }
  } catch (error) {
    if (error instanceof AdminContentError) throw error;
    console.error("updateThemeDifficultyGuide: unexpected database error", error);
    throw new AdminContentError("Database operation failed.", "db_error");
  } finally {
    connection.release();
  }
}

function mapListItem(row: ListRow): AdminQuizTaskListItem {
  const taskText = row.task_text;
  const fromText = taskText.replace(/\$+/g, " ").replace(/\s+/g, " ").trim();
  const label = (fromText || row.name.trim() || `#${row.id}`).slice(0, 160);
  return {
    id: row.id,
    name: row.name.trim(),
    label,
    taskText,
    difficulty: row.difficulty,
    inUse: row.in_use === true || Number(row.in_use) === 1,
    status: readStatus(row.status),
    sourceTaskId: readSourceId(row.source_task_id),
  };
}

export async function getQuizTasksByTheme(
  themeId: number,
  options: { page?: number; pageSize?: number; search?: string; status?: string } = {},
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<AdminQuizTaskListPage> {
  const pageSize = Math.max(
    1,
    Math.floor(options.pageSize ?? ADMIN_TASKS_PAGE_SIZE),
  );
  const requestedPage = Math.max(1, Math.floor(options.page ?? 1));
  const search = themeTaskSearchClause(options.search ?? "");
  const status = themeTaskStatusClause(options.status ?? "");
  const connection = await deps.getConnection();
  try {
    const countRows = await connection.query<{ total: number | string }>(
      SQL_COUNT_BY_THEME + search.sql + status.sql,
      [themeId, ...search.params, ...status.params],
    );
    const total = Number(countRows[0]?.total ?? 0);
    const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;

    const rows =
      total === 0
        ? []
        : await connection.query<ListRow>(
            // MySQL prepared statements reject `LIMIT ?` — inline validated ints.
            `${SQL_LIST_BY_THEME}${search.sql}${status.sql} ORDER BY q.id ASC LIMIT ${pageSize} OFFSET ${offset}`,
            [themeId, ...search.params, ...status.params],
          );

    return {
      items: rows.map(mapListItem),
      total,
      page,
      pageSize,
      totalPages,
    };
  } finally {
    connection.release();
  }
}

export async function getQuizTaskById(
  taskId: number,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<AdminQuizTask | null> {
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<TaskRow>(SQL_GET_BY_ID, [taskId]);
    const row = rows[0];
    if (!row) return null;
    const params = await loadTaskParamValues(connection, taskId);
    return mapTask(row, params);
  } finally {
    connection.release();
  }
}

/** Previous / next task ids within the same theme (ordered by id). */
export async function getNeighborTaskIds(
  themeId: number,
  taskId: number,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<{ prevId: number | null; nextId: number | null }> {
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<{
      prev_id: number | null;
      next_id: number | null;
    }>(SQL_NEIGHBOR_IDS, [themeId, taskId, themeId, taskId]);
    const row = rows[0];
    return {
      prevId: row?.prev_id ?? null,
      nextId: row?.next_id ?? null,
    };
  } finally {
    connection.release();
  }
}

async function assertThemeExists(
  connection: SqlConnection,
  themeId: number,
): Promise<void> {
  const rows = await connection.query<{ id: number }>(SQL_THEME_EXISTS, [
    themeId,
  ]);
  if (!rows[0]) {
    throw new AdminContentError("Theme not found.", "theme_not_found");
  }
}

export async function createQuizTask(
  input: AdminQuizTaskInput,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<AdminQuizTask> {
  const connection = await deps.getConnection();
  try {
    await connection.beginTransaction();
    await assertThemeExists(connection, input.themeId);

    const nextRows = await connection.query<{ next_id: number | string }>(
      SQL_NEXT_ID,
      [],
    );
    const nextId = Number(nextRows[0]?.next_id);
    if (!Number.isInteger(nextId) || nextId <= 0) {
      throw new AdminContentError("Could not allocate task id.", "db_error");
    }

    await connection.execute(SQL_INSERT, [
      nextId,
      input.name,
      input.taskText,
      input.themeId,
      input.answer1,
      input.answer2,
      input.answer3,
      input.answer4,
      input.rightAnswerN,
      input.comments ?? "",
      input.difficulty,
      input.hintShort ?? null,
    ]);

    const params = input.paramDrafts
      ? await replaceQuizTaskParams(
          connection,
          nextId,
          input.themeId,
          input.paramDrafts,
        )
      : [];

    await connection.commit();
    return {
      id: nextId,
      name: input.name,
      taskText: input.taskText,
      themeId: input.themeId,
      answer1: input.answer1,
      answer2: input.answer2,
      answer3: input.answer3,
      answer4: input.answer4,
      rightAnswerN: input.rightAnswerN as 1 | 2 | 3 | 4,
      comments: input.comments ?? "",
      difficulty: input.difficulty,
      params,
      status: "published",
      sourceTaskId: null,
      hintShort: input.hintShort ?? "",
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // ignore rollback errors
    }
    if (error instanceof AdminContentError) throw error;
    console.error("createQuizTask: unexpected database error", error);
    throw new AdminContentError("Database operation failed.", "db_error");
  } finally {
    connection.release();
  }
}

export async function updateQuizTask(
  taskId: number,
  input: AdminQuizTaskInput,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<AdminQuizTask> {
  const connection = await deps.getConnection();
  try {
    await connection.beginTransaction();
    await assertThemeExists(connection, input.themeId);
    await connection.execute(SQL_UPDATE, [
      input.name,
      input.taskText,
      input.themeId,
      input.answer1,
      input.answer2,
      input.answer3,
      input.answer4,
      input.rightAnswerN,
      input.comments ?? "",
      input.difficulty,
      input.hintShort ?? null,
      taskId,
    ]);
    const existing = await connection.query<{
      id: number;
      status?: string | null;
      source_task_id?: number | string | null;
    }>(
      `SELECT id, status, source_task_id FROM quiz_tasks WHERE id = ? LIMIT 1`,
      [taskId],
    );
    if (!existing[0]) {
      throw new AdminContentError("Task not found.", "not_found");
    }
    const params = input.paramDrafts
      ? await replaceQuizTaskParams(
          connection,
          taskId,
          input.themeId,
          input.paramDrafts,
        )
      : await loadTaskParamValues(connection, taskId);
    await connection.commit();
    return {
      id: taskId,
      name: input.name,
      taskText: input.taskText,
      themeId: input.themeId,
      answer1: input.answer1,
      answer2: input.answer2,
      answer3: input.answer3,
      answer4: input.answer4,
      rightAnswerN: input.rightAnswerN as 1 | 2 | 3 | 4,
      comments: input.comments ?? "",
      difficulty: input.difficulty,
      params,
      status: readStatus(existing[0]?.status),
      sourceTaskId: readSourceId(existing[0]?.source_task_id),
      hintShort: input.hintShort ?? "",
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // The connection may already be rolled back.
    }
    if (error instanceof AdminContentError) throw error;
    console.error("updateQuizTask: unexpected database error", error);
    throw new AdminContentError("Database operation failed.", "db_error");
  } finally {
    connection.release();
  }
}

async function allocateTaskId(connection: SqlConnection): Promise<number> {
  const nextRows = await connection.query<{ next_id: number | string }>(SQL_NEXT_ID, []);
  const nextId = Number(nextRows[0]?.next_id);
  if (!Number.isInteger(nextId) || nextId <= 0) {
    throw new AdminContentError("Could not allocate task id.", "db_error");
  }
  return nextId;
}

/** Saves verified tasks as drafts and copies the source parameter values. */
export async function insertGeneratedDrafts(
  sourceTaskId: number,
  themeId: number,
  params: readonly TaskParamValue[],
  drafts: readonly GeneratedDraft[],
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<number[]> {
  if (!Number.isInteger(sourceTaskId) || sourceTaskId <= 0) {
    throw new AdminContentError("Invalid task.", "invalid_input");
  }
  if (drafts.length === 0) return [];
  const connection = await deps.getConnection();
  try {
    await connection.beginTransaction();
    await assertThemeExists(connection, themeId);
    const source = await connection.query<{ id: number }>(
      `SELECT id FROM quiz_tasks WHERE id = ? LIMIT 1`,
      [sourceTaskId],
    );
    if (!source[0]) {
      throw new AdminContentError("Task not found.", "not_found");
    }
    const paramDrafts = params.map((value) => ({
      paramId: value.paramId,
      raw: String(value.intValue),
    }));
    const ids: number[] = [];
    for (const draft of drafts) {
      const nextId = await allocateTaskId(connection);
      await connection.execute(SQL_INSERT_DRAFT, [
        nextId,
        draft.name,
        draft.taskText,
        themeId,
        draft.answer1,
        draft.answer2,
        draft.answer3,
        draft.answer4,
        draft.rightAnswerN,
        "",
        draft.difficulty,
        draft.hintShort,
        sourceTaskId,
      ]);
      if (paramDrafts.length > 0) {
        await replaceQuizTaskParams(connection, nextId, themeId, paramDrafts);
      }
      ids.push(nextId);
    }
    await connection.commit();
    return ids;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // The connection may already be rolled back.
    }
    if (error instanceof AdminContentError) throw error;
    console.error("insertGeneratedDrafts: unexpected database error", error);
    throw new AdminContentError("Database operation failed.", "db_error");
  } finally {
    connection.release();
  }
}

export async function publishQuizTask(
  taskId: number,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<void> {
  if (!Number.isInteger(taskId) || taskId <= 0) {
    throw new AdminContentError("Invalid task.", "invalid_input");
  }
  const connection = await deps.getConnection();
  try {
    const result = await connection.execute(SQL_PUBLISH, [taskId]);
    if (result.affectedRows === 0) {
      const existing = await connection.query<{ id: number }>(
        `SELECT id FROM quiz_tasks WHERE id = ? LIMIT 1`,
        [taskId],
      );
      if (!existing[0]) {
        throw new AdminContentError("Task not found.", "not_found");
      }
    }
  } catch (error) {
    if (error instanceof AdminContentError) throw error;
    console.error("publishQuizTask: unexpected database error", error);
    throw new AdminContentError("Database operation failed.", "db_error");
  } finally {
    connection.release();
  }
}

export async function updateQuizTaskDifficulty(
  taskId: number,
  difficulty: number,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<void> {
  if (
    !Number.isInteger(taskId) ||
    taskId <= 0 ||
    !Number.isInteger(difficulty) ||
    difficulty < MIN_DIFFICULTY
  ) {
    throw new AdminContentError("Invalid difficulty.", "invalid_input");
  }

  const connection = await deps.getConnection();
  try {
    const result = await connection.execute(SQL_UPDATE_DIFFICULTY, [
      difficulty,
      taskId,
    ]);
    // Unchanged difficulty reports 0 changed rows. Confirm the task exists.
    if (result.affectedRows === 0) {
      const existing = await connection.query<{ id: number }>(
        `SELECT id FROM quiz_tasks WHERE id = ? LIMIT 1`,
        [taskId],
      );
      if (!existing[0]) {
        throw new AdminContentError("Task not found.", "not_found");
      }
    }
  } catch (error) {
    if (error instanceof AdminContentError) throw error;
    console.error("updateQuizTaskDifficulty: unexpected database error", error);
    throw new AdminContentError("Database operation failed.", "db_error");
  } finally {
    connection.release();
  }
}

async function unlinkAndDeleteQuizTask(
  connection: SqlConnection,
  taskId: number,
): Promise<void> {
  const sessionRows = await connection.query<{ session_id: number }>(
    SQL_SESSION_IDS_FOR_TASK,
    [taskId],
  );
  const sessionIds = [
    ...new Set(
      sessionRows
        .map((row) => Number(row.session_id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];

  await connection.execute(SQL_DELETE_SESSION_LINKS, [taskId]);
  if (sessionIds.length > 0) {
    await connection.execute(sqlRecalculateSessions(sessionIds));
  }

  const result = await connection.execute(SQL_DELETE, [taskId]);
  if (result.affectedRows === 0) {
    throw new AdminContentError("Task not found.", "not_found");
  }
}

async function withDeleteTransaction<T>(
  deps: { getConnection: () => Promise<SqlConnection> },
  work: (connection: SqlConnection) => Promise<T>,
): Promise<T> {
  const connection = await deps.getConnection();
  try {
    await connection.beginTransaction();
    const value = await work(connection);
    await connection.commit();
    return value;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // The connection may already be rolled back.
    }
    if (error instanceof AdminContentError) throw error;
    const errno =
      typeof error === "object" && error !== null && "errno" in error
        ? Number((error as { errno?: number }).errno)
        : undefined;
    // MySQL ER_ROW_IS_REFERENCED_2 — something other than session links.
    if (errno === 1451) {
      throw new AdminContentError(
        "Task is referenced by existing sessions.",
        "in_use",
      );
    }
    console.error("deleteQuizTask: unexpected database error", error);
    throw new AdminContentError("Database operation failed.", "db_error");
  } finally {
    connection.release();
  }
}

export async function deleteQuizTask(
  taskId: number,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<void> {
  await withDeleteTransaction(deps, (connection) =>
    unlinkAndDeleteQuizTask(connection, taskId),
  );
}

/** Deletes every id in one transaction. A missing id is skipped. */
export async function deleteQuizTasks(
  taskIds: number[],
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<number> {
  const ids = [...new Set(taskIds)];
  return withDeleteTransaction(deps, async (connection) => {
    let deleted = 0;
    for (const taskId of ids) {
      try {
        await unlinkAndDeleteQuizTask(connection, taskId);
        deleted += 1;
      } catch (error) {
        if (error instanceof AdminContentError && error.code === "not_found") {
          continue;
        }
        throw error;
      }
    }
    if (deleted === 0) {
      throw new AdminContentError("Task not found.", "not_found");
    }
    return deleted;
  });
}
