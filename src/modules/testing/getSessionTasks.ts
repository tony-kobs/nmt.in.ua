import type { SqlConnection } from "@/lib/db/mysql";
import {
  SESSION_STATUS_COMPLETED,
  SESSION_STATUS_PLANNED,
} from "@/modules/sessions/types";
import { toTrainerSessionSummary } from "./finishTrainerSession";
import type { SessionTask, SessionTasksResult } from "./types";

const SQL_SESSION_HEADER = `
  SELECT
    ts.id,
    ts.theme_id,
    ts.tasks_number,
    ts.right_number,
    ts.time,
    ts.session_status,
    t.code AS theme_code,
    t.name AS theme_name
  FROM task_sessions ts
  INNER JOIN themes t ON t.id = ts.theme_id
  WHERE ts.id = ? AND ts.user_id = ?
`;

/**
 * Loads session tasks without `right_answer_n` or `comments` — those stay
 * server-side until checkAnswer / finishTrainerSession.
 */
const SQL_SESSION_TASKS = `
  SELECT
    t2s.id AS mapping_id,
    t2s.task_id,
    t2s.status,
    qt.name,
    qt.task_text,
    qt.answer_1,
    qt.answer_2,
    qt.answer_3,
    qt.answer_4
  FROM tasks2session t2s
  INNER JOIN quiz_tasks qt ON qt.id = t2s.task_id
  WHERE t2s.session_id = ?
  ORDER BY t2s.id ASC
`;

type SessionHeaderRow = {
  id: number;
  theme_id: number;
  tasks_number: number;
  right_number: number;
  time: number;
  session_status: number;
  theme_code: string;
  theme_name: string;
};

type SessionTaskRow = {
  mapping_id: number;
  task_id: number;
  status: number;
  name: string;
  task_text: string;
  answer_1: string;
  answer_2: string;
  answer_3: string;
  answer_4: string;
};

export type GetSessionTasksErrorCode =
  | "invalid_input"
  | "session_not_found"
  | "db_error";

export class GetSessionTasksError extends Error {
  constructor(
    message: string,
    public readonly code: GetSessionTasksErrorCode,
  ) {
    super(message);
    this.name = "GetSessionTasksError";
  }
}

type GetSessionTasksDeps = {
  getConnection: () => Promise<SqlConnection>;
};

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function validateSessionId(sessionId: unknown): number {
  if (!isPositiveInt(sessionId)) {
    throw new GetSessionTasksError(
      "sessionId must be a positive integer.",
      "invalid_input",
    );
  }
  return sessionId;
}

function mapRow(row: SessionTaskRow): SessionTask {
  return {
    mappingId: row.mapping_id,
    taskId: row.task_id,
    name: row.name.trim(),
    taskText: row.task_text.trim(),
    answers: [
      { number: 1, text: row.answer_1.trim() },
      { number: 2, text: row.answer_2.trim() },
      { number: 3, text: row.answer_3.trim() },
      { number: 4, text: row.answer_4.trim() },
    ],
    status: row.status,
  };
}

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

function validateUserId(userId: unknown): number {
  if (!isPositiveInt(userId)) {
    throw new GetSessionTasksError(
      "userId must be a positive integer.",
      "invalid_input",
    );
  }
  return userId;
}

/** Returns all tasks linked to a topic-test session (client-safe fields only). */
export async function getSessionTasks(
  sessionId: unknown,
  userId: unknown,
  deps: GetSessionTasksDeps = { getConnection: loadDefaultConnection },
): Promise<SessionTasksResult> {
  const validSessionId = validateSessionId(sessionId);
  const validUserId = validateUserId(userId);

  try {
    const connection = await deps.getConnection();
    try {
      const headers = await connection.query<SessionHeaderRow>(
        SQL_SESSION_HEADER,
        [validSessionId, validUserId],
      );
      const header = headers[0];

      if (!header) {
        throw new GetSessionTasksError(
          "Session not found or has no linked tasks.",
          "session_not_found",
        );
      }

      const rows = await connection.query<SessionTaskRow>(SQL_SESSION_TASKS, [
        validSessionId,
      ]);

      if (rows.length === 0) {
        if (header.session_status === SESSION_STATUS_PLANNED) {
          return {
            sessionId: validSessionId,
            sessionStatus: header.session_status,
            themeId: header.theme_id,
            themeCode: header.theme_code.trim(),
            themeName: header.theme_name.trim(),
            tasks: [],
            summary: null,
            isPlannedWithoutTasks: true,
          };
        }
        throw new GetSessionTasksError(
          "Session not found or has no linked tasks.",
          "session_not_found",
        );
      }

      return {
        sessionId: validSessionId,
        sessionStatus: header.session_status,
        themeId: header.theme_id,
        themeCode: header.theme_code.trim(),
        themeName: header.theme_name.trim(),
        tasks: rows.map(mapRow),
        summary:
          header.session_status === SESSION_STATUS_COMPLETED
            ? toTrainerSessionSummary(header)
            : null,
      };
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof GetSessionTasksError) {
      throw error;
    }
    console.error("getSessionTasks: unexpected database error", error);
    throw new GetSessionTasksError("Database operation failed.", "db_error");
  }
}
