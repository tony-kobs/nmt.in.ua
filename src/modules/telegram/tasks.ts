import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { SESSION_STATUS_CREATED, SESSION_STATUS_PLANNED } from "@/modules/sessions/types";
import { nowUnixSec } from "@/modules/testing/sessionElapsed";
import { TASK_STATUS_CORRECT, TASK_STATUS_INCORRECT } from "@/modules/testing/types";
import { loadTelegramConnection } from "./schema";
import { getTelegramTaskDayInterval } from "./taskDay";

export const TELEGRAM_TASK_SESSIONS_LIMIT = 50;

type TelegramTasksError = { status: "error"; code: "invalidIdentity" | "notLinked" | "databaseFailure" };
export type TelegramLinkedUserResult = { status: "success"; user: { userId: number } } | TelegramTasksError;
export type TelegramTaskSession = {
  sessionId: number;
  sessionType: number;
  themeId: number | null;
  themeName: string | null;
  status: number;
  taskCount: number;
  completedTaskCount: number;
  expiresAt: number | null;
};
export type TelegramTaskSessionsResult = { status: "success"; sessions: TelegramTaskSession[] } | TelegramTasksError;

type Deps = {
  getConnection: () => Promise<SqlConnection>;
  nowSec?: () => number;
  logError?: (error: unknown) => void;
};

const defaultDeps: Deps = { getConnection: loadTelegramConnection };

function normalizeIdentity(value: unknown): string | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  if (typeof value !== "string" || !/^[1-9][0-9]{0,15}$/.test(value)) return null;
  return Number.isSafeInteger(Number(value)) ? value : null;
}

const SQL_LINKED_USER = `
  SELECT uta.user_id
  FROM user_telegram_accounts uta
  INNER JOIN app_users u ON u.id = uta.user_id AND u.is_banned = 0
  WHERE uta.telegram_user_id = ?
  LIMIT 1
`;

function taskSessionsSql(today: boolean): string {
  return `
  SELECT uta.user_id, ts.id, ts.session_type, ts.theme_id,
    t.name AS theme_name, ts.session_status, ts.tasks_number, ts.expire_time,
    (SELECT COUNT(*) FROM tasks2session m
      WHERE m.session_id = ts.id AND m.user_id = uta.user_id) AS mapping_count,
    (SELECT COUNT(*) FROM tasks2session m
      WHERE m.session_id = ts.id AND m.user_id = uta.user_id
        AND m.status IN (?, ?)) AS answered_count
  FROM user_telegram_accounts uta
  INNER JOIN app_users u ON u.id = uta.user_id AND u.is_banned = 0
  LEFT JOIN task_sessions ts ON ts.user_id = uta.user_id
    AND ts.session_status IN (?, ?)
    AND ts.expire_time > ?
    ${today ? "AND ts.expire_time >= ? AND ts.expire_time < ?" : ""}
    AND NOT (ts.tasks_number > 0 AND ts.right_number >= ts.tasks_number AND ts.time > 0)
    AND NOT EXISTS (
      SELECT 1 FROM mentor_assignment_members mam
      INNER JOIN mentor_assignments ma ON ma.id = mam.assignment_id
      WHERE mam.session_id = ts.id AND mam.student_user_id = uta.user_id
        AND (ma.status = 'cancelled' OR ma.available_at > ? OR ma.due_at <= ?)
    )
  LEFT JOIN themes t ON t.id = ts.theme_id
  WHERE uta.telegram_user_id = ?
  ORDER BY ts.id DESC
  ${today ? "" : `LIMIT ${TELEGRAM_TASK_SESSIONS_LIMIT}`}
`;
}

async function read<T>(identity: string, deps: Deps, query: (connection: SqlConnection, identity: string) => Promise<T>): Promise<T | TelegramTasksError> {
  try {
    const connection = await deps.getConnection();
    try {
      return await query(connection, identity);
    } finally {
      connection.release();
    }
  } catch (error) {
    if (deps.logError) deps.logError(error);
    else console.error("telegram tasks: database read failed", error);
    return { status: "error", code: "databaseFailure" };
  }
}

export async function getLinkedUserByTelegramId(telegramUserId: unknown, deps: Deps = defaultDeps): Promise<TelegramLinkedUserResult> {
  const identity = normalizeIdentity(telegramUserId);
  if (!identity) return { status: "error", code: "invalidIdentity" };
  return read(identity, deps, async (connection, id): Promise<TelegramLinkedUserResult> => {
    const rows = await connection.query<{ user_id: number }>(SQL_LINKED_USER, [id]);
    return rows[0]
      ? { status: "success", user: { userId: rows[0].user_id } }
      : { status: "error", code: "notLinked" };
  });
}

export async function getTelegramTaskSessions(telegramUserId: unknown, deps: Deps = defaultDeps): Promise<TelegramTaskSessionsResult> {
  return readTaskSessions(telegramUserId, deps, false);
}

export async function getTelegramTodayTaskSessions(telegramUserId: unknown, deps: Deps = defaultDeps): Promise<TelegramTaskSessionsResult> {
  return readTaskSessions(telegramUserId, deps, true);
}

async function readTaskSessions(telegramUserId: unknown, deps: Deps, today: boolean): Promise<TelegramTaskSessionsResult> {
  const identity = normalizeIdentity(telegramUserId);
  if (!identity) return { status: "error", code: "invalidIdentity" };
  return read(identity, deps, async (connection, id): Promise<TelegramTaskSessionsResult> => {
    const now = (deps.nowSec ?? nowUnixSec)();
    const interval = today ? getTelegramTaskDayInterval(now) : null;
    const dayParams = interval ? [interval.startSec, interval.endSec] : [];
    const rows = await connection.query<{
      user_id: number;
      id: number | null;
      session_type: number;
      theme_id: number | null;
      theme_name: string | null;
      session_status: number;
      tasks_number: number;
      expire_time: number;
      mapping_count: number;
      answered_count: number;
    }>(taskSessionsSql(today), [TASK_STATUS_CORRECT, TASK_STATUS_INCORRECT, SESSION_STATUS_CREATED, SESSION_STATUS_PLANNED, now, ...dayParams, now, now, id]);
    if (!rows.length) return { status: "error", code: "notLinked" };
    return {
      status: "success",
      sessions: rows.filter((row) => row.id !== null).map((row) => ({
        sessionId: row.id!,
        sessionType: row.session_type,
        themeId: row.theme_id,
        themeName: row.theme_name?.trim() ?? null,
        status: row.session_status,
        taskCount: Number(row.mapping_count) || row.tasks_number,
        completedTaskCount: Number(row.answered_count),
        expiresAt: row.expire_time,
      })),
    };
  });
}
