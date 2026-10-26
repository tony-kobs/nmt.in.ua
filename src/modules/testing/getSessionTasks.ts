import type { SqlConnection } from "@/lib/db/mysql";
import {
  SESSION_STATUS_COMPLETED,
  SESSION_STATUS_PLANNED,
} from "@/modules/sessions/types";
import { toTrainerSessionSummary } from "./finishTrainerSession";
import { SESSION_TYPE_NMT_SIMULATOR } from "./startNmtSimulator";
import { resolveNmtMatch } from "./nmtMatch";
import { normalizeNmtRichText } from "./normalizeNmtRichText";
import { nowUnixSec } from "./sessionElapsed";
import { isSessionExpired } from "./sessionExpiry";
import type {
  NmtTaskKind,
  SessionTask,
  SessionTasksResult,
} from "./types";

const SQL_SESSION_HEADER = `
  SELECT
    ts.id,
    ts.theme_id,
    ts.session_type,
    ts.tasks_number,
    ts.right_number,
    ts.time,
    ts.session_status,
    ts.expire_time,
    t.code AS theme_code,
    t.name AS theme_name,
    nv.label AS variant_label
  FROM task_sessions ts
  LEFT JOIN themes t ON t.id = ts.theme_id
  LEFT JOIN nmt_variants nv ON nv.id = ts.nmt_variant_id
  WHERE ts.id = ? AND ts.user_id = ?
`;

const SQL_SESSION_TASKS = `
  SELECT
    t2s.id AS mapping_id,
    t2s.task_id,
    t2s.status,
    t2s.first_attempt_status,
    t2s.retry_used,
    t2s.hint_level_unlocked,
    CASE WHEN t2s.hint_level_unlocked >= 1 THEN qt.hint_direction ELSE NULL END AS hint_direction,
    CASE WHEN t2s.hint_level_unlocked >= 2 THEN qt.hint_rule ELSE NULL END AS hint_rule,
    CASE WHEN t2s.hint_level_unlocked >= 3 THEN qt.hint_example ELSE NULL END AS hint_example,
    CASE WHEN t2s.retry_used = 1 AND t2s.status = -1 THEN qt.right_answer_n ELSE NULL END AS revealed_answer,
    CASE WHEN t2s.retry_used = 1 AND t2s.status = -1 THEN qt.comments ELSE NULL END AS revealed_explanation,
    qt.name,
    qt.task_text,
    qt.answer_1,
    qt.answer_2,
    qt.answer_3,
    qt.answer_4,
    NULL AS answer_5,
    'mcq' AS task_kind
  FROM tasks2session t2s
  INNER JOIN quiz_tasks qt ON qt.id = t2s.task_id
  WHERE t2s.session_id = ?
  ORDER BY t2s.id ASC
`;

const SQL_NMT_SESSION_TASKS = `
  SELECT
    t2s.id AS mapping_id,
    t2s.task_id,
    t2s.status,
    qt.name,
    qt.task_text,
    qt.answer_1,
    qt.answer_2,
    qt.answer_3,
    qt.answer_4,
    qt.answer_5,
    qt.task_kind
  FROM tasks2session t2s
  INNER JOIN nmt_quiz_tasks qt ON qt.id = t2s.task_id
  WHERE t2s.session_id = ?
  ORDER BY t2s.id ASC
`;

type SessionHeaderRow = {
  id: number;
  theme_id: number | null;
  session_type: number;
  tasks_number: number;
  right_number: number;
  time: number;
  session_status: number;
  expire_time: number;
  theme_code: string | null;
  theme_name: string | null;
  variant_label: string | null;
};

type SessionTaskRow = {
  mapping_id: number;
  task_id: number;
  status: number;
  first_attempt_status?: number | null;
  retry_used?: number;
  hint_level_unlocked?: number;
  hint_direction?: string | null;
  hint_rule?: string | null;
  hint_example?: string | null;
  revealed_answer?: number | null;
  revealed_explanation?: string | null;
  name: string;
  task_text: string;
  answer_1: string | null;
  answer_2: string | null;
  answer_3: string | null;
  answer_4: string | null;
  answer_5: string | null;
  task_kind: NmtTaskKind | "mcq";
};

export type GetSessionTasksErrorCode =
  | "invalid_input"
  | "session_not_found"
  | "session_expired"
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
  nowSec?: () => number;
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

function mapRow(row: SessionTaskRow, isNmt: boolean): SessionTask {
  const normalize = isNmt
    ? (value: string) => normalizeNmtRichText(value)
    : (value: string) => value.trim();

  const answers = [
    row.answer_1,
    row.answer_2,
    row.answer_3,
    row.answer_4,
    row.answer_5,
  ]
    .map((text, index) =>
      text != null && text.trim() !== ""
        ? {
            number: (index + 1) as 1 | 2 | 3 | 4 | 5,
            text: normalize(text),
          }
        : null,
    )
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const match = isNmt
    ? resolveNmtMatch({
        name: row.name,
        taskText: row.task_text,
        answers,
        taskKind: row.task_kind,
      })
    : null;

  return {
    mappingId: row.mapping_id,
    taskId: row.task_id,
    name: row.name.trim(),
    taskText: match?.stem ?? normalize(row.task_text),
    answers,
    status: row.status,
    ...(!isNmt && row.hint_level_unlocked ? { hints:
      [row.hint_direction, row.hint_rule, row.hint_example].flatMap((text, index) =>
        index < row.hint_level_unlocked! && text?.trim()
          ? [{ level: (index + 1) as 1 | 2 | 3, text: text.trim(), isFinal: index === 2 }]
          : []) } : {}),
    ...(!isNmt && row.first_attempt_status === -1 && row.status === -1 && row.retry_used === 0
      ? { retryAvailable: true } : {}),
    ...(!isNmt && row.retry_used === 1 && row.status === -1
      ? { revealed: {
          correctAnswerNumber: row.revealed_answer ?? null,
          correctAnswerText: answers.find((answer) => answer.number === row.revealed_answer)?.text ?? null,
          explanation: row.revealed_explanation?.trim() || null,
        } } : {}),
    ...(isNmt ? { taskKind: row.task_kind as NmtTaskKind } : {}),
    ...(match ? { match: match.match } : {}),
  };
}

function themeFields(header: SessionHeaderRow): {
  themeId: number;
  themeCode: string | null;
  themeName: string;
} {
  if (header.session_type === SESSION_TYPE_NMT_SIMULATOR) {
    return {
      themeId: 0,
      themeCode: null,
      themeName: (header.variant_label ?? "Симулятор НМТ").trim(),
    };
  }
  return {
    themeId: header.theme_id ?? 0,
    themeCode: header.theme_code?.trim() || null,
    themeName: (header.theme_name ?? "").trim(),
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

/** Returns all tasks linked to a session (client-safe fields only). */
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

      // Completed sessions are always readable, however old — expiration
      // only gates further interaction with an active session (including
      // activating a still-planned one).
      if (
        header.session_status !== SESSION_STATUS_COMPLETED &&
        isSessionExpired(header.expire_time, (deps.nowSec ?? nowUnixSec)())
      ) {
        throw new GetSessionTasksError(
          "This session's 24h lifetime has expired.",
          "session_expired",
        );
      }

      const isNmt = header.session_type === SESSION_TYPE_NMT_SIMULATOR;
      const theme = themeFields(header);

      const rows = await connection.query<SessionTaskRow>(
        isNmt ? SQL_NMT_SESSION_TASKS : SQL_SESSION_TASKS,
        [validSessionId],
      );

      if (rows.length === 0) {
        if (header.session_status === SESSION_STATUS_PLANNED) {
          return {
            sessionId: validSessionId,
            sessionStatus: header.session_status,
            themeId: theme.themeId,
            themeCode: theme.themeCode,
            themeName: theme.themeName,
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
        themeId: theme.themeId,
        themeCode: theme.themeCode,
        themeName: theme.themeName,
        tasks: rows.map((row) => mapRow(row, isNmt)),
        summary:
          header.session_status === SESSION_STATUS_COMPLETED
            ? toTrainerSessionSummary({
                id: header.id,
                theme_id: theme.themeId,
                theme_code: theme.themeCode ?? "",
                theme_name: theme.themeName,
                tasks_number: header.tasks_number,
                right_number: header.right_number,
                time: header.time,
              })
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
