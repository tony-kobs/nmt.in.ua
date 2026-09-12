import type { SqlConnection } from "@/lib/db/mysql";
import { SESSION_STATUS_COMPLETED } from "@/modules/sessions/types";
import { nowUnixSec } from "@/modules/testing/sessionElapsed";
import { isSessionExpired } from "@/modules/testing/sessionExpiry";
import type { SessionTask, SessionTasksResult } from "@/modules/testing/types";
import {
  DIAGNOSTIC_SUMMARY_THEME_ID,
  DIAGNOSTIC_SUMMARY_THEME_NAME,
  toDiagnosticSummary,
} from "./finishDiagnosticSession";
import { isValidOwner, ownerClause, ownerParams, type SessionOwner } from "./sessionOwner";

const SESSION_TYPE_DIAGNOSTIC = 5;

const SQL_SESSION_HEADER = `
  SELECT
    ts.id,
    ts.tasks_number,
    ts.right_number,
    ts.time,
    ts.session_status,
    ts.expire_time
  FROM task_sessions ts
  WHERE ts.id = ? AND ts.session_type = ${SESSION_TYPE_DIAGNOSTIC}
    AND ${ownerClause("ts")}
`;

/** No theme join — a diagnostic session spans many themes, never one. */
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
  tasks_number: number;
  right_number: number;
  time: number;
  session_status: number;
  expire_time: number;
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

export type GetDiagnosticSessionTasksErrorCode =
  | "invalid_input"
  | "session_not_found"
  | "session_expired"
  | "db_error";

export class GetDiagnosticSessionTasksError extends Error {
  constructor(
    message: string,
    public readonly code: GetDiagnosticSessionTasksErrorCode,
  ) {
    super(message);
    this.name = "GetDiagnosticSessionTasksError";
  }
}

type GetDiagnosticSessionTasksDeps = {
  getConnection: () => Promise<SqlConnection>;
  nowSec?: () => number;
};

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function validateSessionId(sessionId: unknown): number {
  if (!isPositiveInt(sessionId)) {
    throw new GetDiagnosticSessionTasksError(
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

/**
 * Owner-aware analog of `src/modules/testing/getSessionTasks.ts` for
 * diagnostic (session_type=5) sessions. A diagnostic attempt is always
 * created with its tasks already attached (unlike planned auto/mentor
 * sessions), so there is no "planned without tasks" branch here.
 */
export async function getDiagnosticSessionTasks(
  sessionId: unknown,
  owner: SessionOwner,
  deps: GetDiagnosticSessionTasksDeps = { getConnection: loadDefaultConnection },
): Promise<SessionTasksResult> {
  const validSessionId = validateSessionId(sessionId);
  if (!isValidOwner(owner)) {
    throw new GetDiagnosticSessionTasksError(
      "owner must be exactly one of userId or guestToken.",
      "invalid_input",
    );
  }

  try {
    const connection = await deps.getConnection();
    try {
      const headers = await connection.query<SessionHeaderRow>(
        SQL_SESSION_HEADER,
        [validSessionId, ...ownerParams(owner)],
      );
      const header = headers[0];

      if (!header) {
        throw new GetDiagnosticSessionTasksError(
          "Session not found for this owner.",
          "session_not_found",
        );
      }

      if (
        header.session_status !== SESSION_STATUS_COMPLETED &&
        isSessionExpired(header.expire_time, (deps.nowSec ?? nowUnixSec)())
      ) {
        throw new GetDiagnosticSessionTasksError(
          "This session's 24h lifetime has expired.",
          "session_expired",
        );
      }

      const rows = await connection.query<SessionTaskRow>(SQL_SESSION_TASKS, [
        validSessionId,
      ]);

      if (rows.length === 0) {
        throw new GetDiagnosticSessionTasksError(
          "Session not found or has no linked tasks.",
          "session_not_found",
        );
      }

      return {
        sessionId: validSessionId,
        sessionStatus: header.session_status,
        themeId: DIAGNOSTIC_SUMMARY_THEME_ID,
        themeCode: null,
        themeName: DIAGNOSTIC_SUMMARY_THEME_NAME,
        tasks: rows.map(mapRow),
        summary:
          header.session_status === SESSION_STATUS_COMPLETED
            ? toDiagnosticSummary(header)
            : null,
      };
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof GetDiagnosticSessionTasksError) {
      throw error;
    }
    console.error(
      "getDiagnosticSessionTasks: unexpected database error",
      error,
    );
    throw new GetDiagnosticSessionTasksError(
      "Database operation failed.",
      "db_error",
    );
  }
}
