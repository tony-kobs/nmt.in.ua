import type { SqlConnection } from "@/lib/db/mysql";
import {
  SESSION_STATUS_PLANNED,
  SESSION_TYPE_AUTO,
} from "@/modules/sessions/types";
import { nowUnixSec } from "@/modules/testing/sessionElapsed";
import { computeSessionDeadline, isSessionExpired } from "@/modules/testing/sessionExpiry";
import { TOPIC_TEST_TASK_COUNT } from "@/modules/testing/startTopicTest";

import type { RecommendedAction } from "./index";

const SQL_SELECT_PLANNED_AUTO = `
  SELECT id, theme_id, expire_time
  FROM task_sessions
  WHERE user_id = ?
    AND session_type = ?
    AND session_status = ?
`;

const SQL_INSERT_PLANNED_SESSION = `
  INSERT INTO task_sessions (
    user_id, session_type, theme_id, tasks_number,
    right_number, time, session_status, start_time, expire_time
  ) VALUES (?, ?, ?, ?, 0, 0, ?, 0, ?)
`;

const SQL_DELETE_STALE_PLANNED = `
  DELETE FROM task_sessions
  WHERE user_id = ?
    AND session_type = ?
    AND session_status = ?
    AND theme_id NOT IN (__PLACEHOLDERS__)
`;

export type PersistRecommendationsResult = {
  actions: RecommendedAction[];
  createdSessionIds: number[];
};

type PersistRecommendationsDeps = {
  getConnection: () => Promise<SqlConnection>;
  nowSec?: () => number;
};

type PlannedAutoRow = {
  id: number;
  theme_id: number;
  expire_time: number;
};

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function topicTestThemeIds(actions: RecommendedAction[]): number[] {
  const ids = new Set<number>();
  for (const action of actions) {
    if (action.type === "topic-test" && isPositiveInt(action.themeId)) {
      ids.add(action.themeId);
    }
  }
  return Array.from(ids);
}

function withPlannedSessionHrefs(
  actions: RecommendedAction[],
  sessionIdByTheme: Map<number, number>,
): RecommendedAction[] {
  return actions.map((action) => {
    if (action.type !== "topic-test" || !isPositiveInt(action.themeId)) {
      return action;
    }
    const sessionId = sessionIdByTheme.get(action.themeId);
    if (sessionId === undefined) {
      return action;
    }
    return {
      ...action,
      href: `/session/${sessionId}`,
    };
  });
}

/**
 * Creates planned auto-sessions for topic-test recommendations and removes
 * stale planned auto rows for themes no longer recommended.
 */
export async function persistRecommendations(
  userId: number,
  actions: RecommendedAction[],
  deps: PersistRecommendationsDeps = { getConnection: loadDefaultConnection },
): Promise<PersistRecommendationsResult> {
  if (!isPositiveInt(userId)) {
    throw new Error("userId must be a positive integer.");
  }

  const themeIds = topicTestThemeIds(actions);
  const createdSessionIds: number[] = [];
  const nowSec = deps.nowSec ?? nowUnixSec;

  if (themeIds.length === 0) {
    const connection = await deps.getConnection();
    try {
      await connection.beginTransaction();
      await deleteStalePlanned(connection, userId, []);
      await connection.commit();
    } catch (error) {
      await connection.rollback().catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
    return { actions, createdSessionIds };
  }

  const connection = await deps.getConnection();
  try {
    await connection.beginTransaction();

    const existing = await connection.query<PlannedAutoRow>(
      SQL_SELECT_PLANNED_AUTO,
      [userId, SESSION_TYPE_AUTO, SESSION_STATUS_PLANNED],
    );
    // An expired planned row is never reused/renewed — it's excluded here so
    // a still-recommended theme gets a fresh row with its own fresh
    // deadline; the stale row is left in place (retained, not deleted).
    const sessionIdByTheme = new Map<number, number>(
      existing
        .filter((row) => !isSessionExpired(row.expire_time, nowSec()))
        .map((row) => [row.theme_id, row.id]),
    );

    for (const themeId of themeIds) {
      if (sessionIdByTheme.has(themeId)) {
        continue;
      }
      const inserted = await connection.execute(SQL_INSERT_PLANNED_SESSION, [
        userId,
        SESSION_TYPE_AUTO,
        themeId,
        TOPIC_TEST_TASK_COUNT,
        SESSION_STATUS_PLANNED,
        computeSessionDeadline(nowSec()),
      ]);
      if (inserted.insertId > 0) {
        sessionIdByTheme.set(themeId, inserted.insertId);
        createdSessionIds.push(inserted.insertId);
      }
    }

    await deleteStalePlanned(connection, userId, themeIds);
    await connection.commit();

    return {
      actions: withPlannedSessionHrefs(actions, sessionIdByTheme),
      createdSessionIds,
    };
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    console.error("persistRecommendations: unexpected database error", error);
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteStalePlanned(
  connection: SqlConnection,
  userId: number,
  keepThemeIds: number[],
): Promise<void> {
  if (keepThemeIds.length === 0) {
    await connection.execute(
      `DELETE FROM task_sessions
       WHERE user_id = ? AND session_type = ? AND session_status = ?`,
      [userId, SESSION_TYPE_AUTO, SESSION_STATUS_PLANNED],
    );
    return;
  }

  const placeholders = keepThemeIds.map(() => "?").join(", ");
  const sql = SQL_DELETE_STALE_PLANNED.replace("__PLACEHOLDERS__", placeholders);
  await connection.execute(sql, [
    userId,
    SESSION_TYPE_AUTO,
    SESSION_STATUS_PLANNED,
    ...keepThemeIds,
  ]);
}
