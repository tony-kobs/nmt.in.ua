import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { sampleRandomIds } from "@/lib/sampleRandomIds";
import { SESSION_STATUS_PLANNED } from "@/modules/sessions/types";

import { ensureTeacherSessionsSchema } from "./schema";
import {
  buildSessionTitle,
  likeContains,
  mapQuizTaskRow,
  parseTaskIdList,
  type QuizTaskRow,
} from "./taskView";
import {
  isPositiveInt,
  MAX_SESSION_TASKS,
  MAX_SESSION_TITLE,
  TeacherSessionsError,
  type TeacherSessionDetail,
  type TeacherSessionOrigin,
  type TeacherSessionSummary,
  type SessionTaskView,
} from "./types";

export type TeacherSessionDeps = {
  getConnection: () => Promise<SqlConnection>;
  ensureSchema?: () => Promise<void>;
  nowSec?: () => number;
};

type SessionRow = {
  id: number;
  title: string;
  theme_id: number;
  theme_name: string;
  difficulty: number | string;
  origin: TeacherSessionOrigin;
  updated_at: number | string;
  task_count: number | string;
  assignment_count: number | string;
  reference_count?: number | string;
};

const SQL_LIST = `
  SELECT
    s.id,
    s.title,
    s.theme_id,
    t.name AS theme_name,
    s.difficulty,
    s.origin,
    s.updated_at,
    (SELECT COUNT(*) FROM session_tasks st WHERE st.session_id = s.id) AS task_count,
    (SELECT COUNT(*) FROM mentor_assignments a
      WHERE a.session_id = s.id AND a.status = 'active') AS assignment_count
  FROM sessions s
  INNER JOIN themes t ON t.id = s.theme_id
  WHERE s.teacher_user_id = ?
  ORDER BY s.updated_at DESC, s.id DESC
`;

const SQL_ONE = `
  SELECT
    s.id,
    s.teacher_user_id,
    s.title,
    s.theme_id,
    t.name AS theme_name,
    s.difficulty,
    s.origin,
    s.updated_at,
    (SELECT COUNT(*) FROM session_tasks st WHERE st.session_id = s.id) AS task_count,
    (SELECT COUNT(*) FROM mentor_assignments a
      WHERE a.session_id = s.id AND a.status = 'active') AS assignment_count,
    (SELECT COUNT(*) FROM mentor_assignments a
      WHERE a.session_id = s.id) AS reference_count
  FROM sessions s
  INNER JOIN themes t ON t.id = s.theme_id
  WHERE s.id = ?
  LIMIT 1
`;

const SQL_TASKS = `
  SELECT
    st.position,
    q.id,
    q.name,
    q.task_text,
    q.difficulty,
    q.answer_1,
    q.answer_2,
    q.answer_3,
    q.answer_4,
    q.right_answer_n,
    q.comments
  FROM session_tasks st
  LEFT JOIN quiz_tasks q ON q.id = st.quiz_task_id
  WHERE st.session_id = ?
  ORDER BY st.position ASC, st.id ASC
`;

const SQL_THEME = `SELECT id, name FROM themes WHERE id = ? LIMIT 1`;

const SQL_QUIZ_BY_IDS_PREFIX = `
  SELECT id, name, task_text, theme_id, difficulty,
    answer_1, answer_2, answer_3, answer_4, right_answer_n, comments
  FROM quiz_tasks
  WHERE id IN (
`;

function asCount(value: number | string | null | undefined): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

async function prepare(
  deps: TeacherSessionDeps,
): Promise<{ connection: SqlConnection; nowSec: number }> {
  await (
    deps.ensureSchema ?? (() => ensureTeacherSessionsSchema(deps.getConnection))
  )();
  const connection = await deps.getConnection();
  const nowSec = (deps.nowSec ?? (() => Math.floor(Date.now() / 1000)))();
  return { connection, nowSec };
}

function summarize(row: SessionRow): TeacherSessionSummary {
  return {
    id: Number(row.id),
    title: row.title.trim(),
    themeId: Number(row.theme_id),
    themeName: row.theme_name.trim(),
    difficulty: asCount(row.difficulty),
    taskCount: asCount(row.task_count),
    assignmentCount: asCount(row.assignment_count),
    updatedAt: asCount(row.updated_at),
  };
}

export async function listSessionTaskViews(
  connection: SqlConnection,
  sessionId: number,
): Promise<SessionTaskView[]> {
  const rows = await connection.query<QuizTaskRow>(SQL_TASKS, [sessionId]);
  return rows.map((row, index) => mapQuizTaskRow(row, index + 1));
}

export async function listTeacherSessions(
  teacherUserId: number,
  deps: TeacherSessionDeps = { getConnection: loadDefaultConnection },
): Promise<TeacherSessionSummary[]> {
  if (!isPositiveInt(teacherUserId)) {
    throw new TeacherSessionsError(
      "teacherUserId must be a positive integer.",
      "invalid_input",
    );
  }
  const { connection } = await prepare(deps);
  try {
    const rows = await connection.query<SessionRow>(SQL_LIST, [teacherUserId]);
    return rows.map(summarize);
  } finally {
    connection.release();
  }
}

export async function getTeacherSession(
  sessionId: number,
  teacherUserId: number,
  deps: TeacherSessionDeps = { getConnection: loadDefaultConnection },
): Promise<TeacherSessionDetail> {
  if (!isPositiveInt(sessionId) || !isPositiveInt(teacherUserId)) {
    throw new TeacherSessionsError(
      "sessionId and teacherUserId must be positive integers.",
      "invalid_input",
    );
  }
  const { connection } = await prepare(deps);
  try {
    return await readDetail(connection, sessionId, teacherUserId);
  } finally {
    connection.release();
  }
}

async function readDetail(
  connection: SqlConnection,
  sessionId: number,
  teacherUserId: number,
): Promise<TeacherSessionDetail> {
  const rows = await connection.query<
    SessionRow & { teacher_user_id: number; reference_count: number | string }
  >(SQL_ONE, [sessionId]);
  const row = rows[0];
  if (!row) {
    throw new TeacherSessionsError("Session not found.", "not_found");
  }
  if (Number(row.teacher_user_id) !== teacherUserId) {
    throw new TeacherSessionsError("Forbidden.", "forbidden");
  }
  const tasks = await listSessionTaskViews(connection, sessionId);
  return {
    ...summarize(row),
    origin: row.origin,
    referenceCount: asCount(row.reference_count),
    tasks,
  };
}

export type SaveTeacherSessionInput = {
  teacherUserId: number;
  sessionId?: number | null;
  title: string;
  themeId: number;
  difficulty: number;
  taskIds: number[];
};

function cleanTitle(title: string): string {
  const trimmed = title.trim().replace(/\s+/g, " ");
  if (!trimmed || trimmed.length > MAX_SESSION_TITLE) {
    throw new TeacherSessionsError("Title is required.", "invalid_input");
  }
  return trimmed;
}

export async function saveTeacherSession(
  input: SaveTeacherSessionInput,
  deps: TeacherSessionDeps = { getConnection: loadDefaultConnection },
): Promise<TeacherSessionDetail> {
  if (!isPositiveInt(input.teacherUserId) || !isPositiveInt(input.themeId)) {
    throw new TeacherSessionsError(
      "teacherUserId and themeId must be positive integers.",
      "invalid_input",
    );
  }
  if (!isPositiveInt(input.difficulty) || input.difficulty > 255) {
    throw new TeacherSessionsError("difficulty must be a positive integer.", "invalid_input");
  }
  const title = cleanTitle(input.title);
  const taskIds = parseTaskIdList(input.taskIds, MAX_SESSION_TASKS);
  if (!taskIds) {
    throw new TeacherSessionsError("Too many tasks or a bad id.", "too_many");
  }
  const sessionId =
    input.sessionId == null
      ? null
      : isPositiveInt(input.sessionId)
        ? input.sessionId
        : null;
  if (input.sessionId != null && sessionId == null) {
    throw new TeacherSessionsError("sessionId must be a positive integer.", "invalid_input");
  }

  const { connection, nowSec } = await prepare(deps);
  let savedId = sessionId ?? 0;

  try {
    await connection.beginTransaction();

    const themes = await connection.query<{ id: number; name: string }>(SQL_THEME, [
      input.themeId,
    ]);
    if (!themes[0]) {
      throw new TeacherSessionsError("Theme not found.", "theme_not_found");
    }

    let activeCount = 0;
    if (sessionId != null) {
      const existing = await connection.query<{
        teacher_user_id: number;
        theme_id: number;
      }>(`SELECT teacher_user_id, theme_id FROM sessions WHERE id = ? LIMIT 1`, [
        sessionId,
      ]);
      const row = existing[0];
      if (!row) throw new TeacherSessionsError("Session not found.", "not_found");
      if (Number(row.teacher_user_id) !== input.teacherUserId) {
        throw new TeacherSessionsError("Forbidden.", "forbidden");
      }
      const counts = await connection.query<{ active_count: number | string }>(
        `SELECT COUNT(*) AS active_count
         FROM mentor_assignments
         WHERE session_id = ? AND status = 'active'`,
        [sessionId],
      );
      activeCount = asCount(counts[0]?.active_count);
      if (activeCount > 0 && Number(row.theme_id) !== input.themeId) {
        throw new TeacherSessionsError(
          "Theme cannot change while the session is assigned.",
          "theme_locked",
        );
      }
      if (activeCount > 0 && taskIds.length === 0) {
        throw new TeacherSessionsError(
          "An assigned session needs at least one task.",
          "empty_assigned",
        );
      }
    }

    if (taskIds.length > 0) {
      const placeholders = taskIds.map(() => "?").join(", ");
      const found = await connection.query<{ id: number; theme_id: number }>(
        `${SQL_QUIZ_BY_IDS_PREFIX}${placeholders})`,
        taskIds,
      );
      if (found.length !== taskIds.length || found.some((row) => Number(row.theme_id) !== input.themeId)) {
        throw new TeacherSessionsError(
          "Every task must belong to the session theme.",
          "task_not_in_theme",
        );
      }
    }

    if (sessionId == null) {
      const inserted = await connection.execute(
        `INSERT INTO sessions (
           teacher_user_id, title, theme_id, difficulty, origin, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'manual', ?, ?)`,
        [input.teacherUserId, title, input.themeId, input.difficulty, nowSec, nowSec],
      );
      if (inserted.insertId <= 0) {
        throw new TeacherSessionsError("Failed to create session.", "db_error");
      }
      savedId = inserted.insertId;
    } else {
      await connection.execute(
        `UPDATE sessions
         SET title = ?, theme_id = ?, difficulty = ?, updated_at = ?
         WHERE id = ? AND teacher_user_id = ?`,
        [title, input.themeId, input.difficulty, nowSec, sessionId, input.teacherUserId],
      );
      await connection.execute(`DELETE FROM session_tasks WHERE session_id = ?`, [sessionId]);
      savedId = sessionId;
    }

    await insertTaskRows(connection, savedId, taskIds);

    if (activeCount > 0) {
      await connection.execute(
        `UPDATE mentor_assignments
         SET tasks_number = ?
         WHERE session_id = ? AND status = 'active'`,
        [taskIds.length, savedId],
      );
      await connection.execute(
        `UPDATE task_sessions ts
         INNER JOIN mentor_assignment_members m ON m.session_id = ts.id
         INNER JOIN mentor_assignments a ON a.id = m.assignment_id
         SET ts.tasks_number = ?
         WHERE a.session_id = ?
           AND a.status = 'active'
           AND ts.session_status = ?
           AND NOT EXISTS (
             SELECT 1 FROM tasks2session t2s WHERE t2s.session_id = ts.id
           )`,
        [taskIds.length, savedId, SESSION_STATUS_PLANNED],
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    if (error instanceof TeacherSessionsError) throw error;
    console.error("saveTeacherSession: unexpected error", error);
    throw new TeacherSessionsError("Database operation failed.", "db_error");
  } finally {
    connection.release();
  }

  return getTeacherSession(savedId, input.teacherUserId, deps);
}

async function insertTaskRows(
  connection: SqlConnection,
  sessionId: number,
  taskIds: number[],
): Promise<void> {
  if (taskIds.length === 0) return;
  const placeholders = taskIds.map(() => "(?, ?, ?)").join(", ");
  const params = taskIds.flatMap((taskId, index) => [sessionId, taskId, index + 1]);
  const inserted = await connection.execute(
    `INSERT INTO session_tasks (session_id, quiz_task_id, position) VALUES ${placeholders}`,
    params,
  );
  if (inserted.affectedRows !== taskIds.length) {
    throw new TeacherSessionsError("Failed to store the task list.", "db_error");
  }
}

export async function deleteTeacherSession(
  sessionId: number,
  teacherUserId: number,
  deps: TeacherSessionDeps = { getConnection: loadDefaultConnection },
): Promise<void> {
  if (!isPositiveInt(sessionId) || !isPositiveInt(teacherUserId)) {
    throw new TeacherSessionsError(
      "sessionId and teacherUserId must be positive integers.",
      "invalid_input",
    );
  }
  const { connection } = await prepare(deps);
  try {
    await connection.beginTransaction();
    const rows = await connection.query<{ teacher_user_id: number }>(
      `SELECT teacher_user_id FROM sessions WHERE id = ? LIMIT 1`,
      [sessionId],
    );
    const row = rows[0];
    if (!row) throw new TeacherSessionsError("Session not found.", "not_found");
    if (Number(row.teacher_user_id) !== teacherUserId) {
      throw new TeacherSessionsError("Forbidden.", "forbidden");
    }
    const refs = await connection.query<{ total: number | string }>(
      `SELECT COUNT(*) AS total FROM mentor_assignments WHERE session_id = ?`,
      [sessionId],
    );
    if (asCount(refs[0]?.total) > 0) {
      throw new TeacherSessionsError(
        "Assigned sessions stay until the assignments are gone.",
        "assigned_locked",
      );
    }
    await connection.execute(
      `DELETE FROM sessions WHERE id = ? AND teacher_user_id = ?`,
      [sessionId, teacherUserId],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    if (error instanceof TeacherSessionsError) throw error;
    console.error("deleteTeacherSession: unexpected error", error);
    throw new TeacherSessionsError("Database operation failed.", "db_error");
  } finally {
    connection.release();
  }
}

const SQL_SEARCH = `
  SELECT id, name, task_text, theme_id, difficulty,
    answer_1, answer_2, answer_3, answer_4, right_answer_n, comments
  FROM quiz_tasks
  WHERE theme_id = ?
    AND (? = 0 OR difficulty = ?)
    AND (? = '' OR name LIKE ? OR task_text LIKE ?)
  ORDER BY id ASC
  LIMIT 20
`;

export async function searchSessionBank(
  teacherUserId: number,
  themeId: number,
  query: string,
  difficulty: number | null,
  deps: TeacherSessionDeps = { getConnection: loadDefaultConnection },
): Promise<SessionTaskView[]> {
  if (!isPositiveInt(teacherUserId) || !isPositiveInt(themeId)) {
    throw new TeacherSessionsError("Invalid search.", "invalid_input");
  }
  const level =
    difficulty != null && isPositiveInt(difficulty) && difficulty <= 255 ? difficulty : 0;
  const needle = query.trim();
  const like = needle ? likeContains(needle) : "";
  const { connection } = await prepare(deps);
  try {
    const rows = await connection.query<QuizTaskRow & { theme_id: number }>(SQL_SEARCH, [
      themeId,
      level,
      level,
      needle ? "1" : "",
      like,
      like,
    ]);
    return rows.map((row, index) => mapQuizTaskRow(row, index + 1));
  } finally {
    connection.release();
  }
}

export async function fillSessionFromBank(
  teacherUserId: number,
  themeId: number,
  difficulty: number,
  count: number,
  excludeIds: number[],
  deps: TeacherSessionDeps = { getConnection: loadDefaultConnection },
): Promise<SessionTaskView[]> {
  if (!isPositiveInt(teacherUserId) || !isPositiveInt(themeId) || !isPositiveInt(difficulty)) {
    throw new TeacherSessionsError("Invalid fill.", "invalid_input");
  }
  const parsedExclude = parseTaskIdList(excludeIds, MAX_SESSION_TASKS);
  if (parsedExclude == null) {
    throw new TeacherSessionsError("Invalid fill.", "invalid_input");
  }
  const exclude = parsedExclude;
  const room = MAX_SESSION_TASKS - exclude.length;
  const want = Math.min(Math.max(0, Math.floor(count)), room);
  if (want < 1) return [];

  const { connection } = await prepare(deps);
  try {
    const filter = exclude.length
      ? ` AND id NOT IN (${exclude.map(() => "?").join(", ")})`
      : "";
    const pool = await connection.query<{ id: number }>(
      `SELECT id FROM quiz_tasks WHERE theme_id = ? AND difficulty = ?${filter}`,
      [themeId, difficulty, ...exclude],
    );
    const picked = sampleRandomIds(
      pool.map((row) => Number(row.id)),
      want,
    );
    if (picked.length === 0) return [];
    const placeholders = picked.map(() => "?").join(", ");
    const rows = await connection.query<QuizTaskRow>(
      `${SQL_QUIZ_BY_IDS_PREFIX}${placeholders})`,
      picked,
    );
    const byId = new Map(rows.map((row) => [Number(row.id), row]));
    return picked.flatMap((id, index) => {
      const row = byId.get(id);
      return row ? [mapQuizTaskRow(row, index + 1)] : [];
    });
  } finally {
    connection.release();
  }
}

export type QuickSessionInput = {
  teacherUserId: number;
  themeId: number;
  themeName: string;
  difficulty: number;
  taskIds: number[];
  nowSec: number;
};

/** Inserts the implicit session used by quick assign. Caller owns the transaction. */
export async function insertQuickSession(
  connection: SqlConnection,
  input: QuickSessionInput,
): Promise<number> {
  const title = buildSessionTitle(input.themeName, input.difficulty);
  const inserted = await connection.execute(
    `INSERT INTO sessions (
       teacher_user_id, title, theme_id, difficulty, origin, created_at, updated_at
     ) VALUES (?, ?, ?, ?, 'quick', ?, ?)`,
    [
      input.teacherUserId,
      title,
      input.themeId,
      input.difficulty,
      input.nowSec,
      input.nowSec,
    ],
  );
  if (inserted.insertId <= 0) {
    throw new TeacherSessionsError("Failed to create session.", "db_error");
  }
  await insertTaskRows(connection, inserted.insertId, input.taskIds);
  return inserted.insertId;
}

export type AssignableSession = {
  id: number;
  teacherUserId: number;
  themeId: number;
  difficulty: number;
  title: string;
  taskCount: number;
};

export async function readAssignableSession(
  connection: SqlConnection,
  sessionId: number,
  teacherUserId: number,
): Promise<AssignableSession> {
  const rows = await connection.query<{
    id: number;
    teacher_user_id: number;
    theme_id: number;
    difficulty: number | string;
    title: string;
    task_count: number | string;
  }>(
    `SELECT s.id, s.teacher_user_id, s.theme_id, s.difficulty, s.title,
       (SELECT COUNT(*) FROM session_tasks st WHERE st.session_id = s.id) AS task_count
     FROM sessions s
     WHERE s.id = ?
     LIMIT 1`,
    [sessionId],
  );
  const row = rows[0];
  if (!row) throw new TeacherSessionsError("Session not found.", "not_found");
  if (Number(row.teacher_user_id) !== teacherUserId) {
    throw new TeacherSessionsError("Forbidden.", "forbidden");
  }
  return {
    id: Number(row.id),
    teacherUserId: Number(row.teacher_user_id),
    themeId: Number(row.theme_id),
    difficulty: asCount(row.difficulty),
    title: row.title.trim(),
    taskCount: asCount(row.task_count),
  };
}
