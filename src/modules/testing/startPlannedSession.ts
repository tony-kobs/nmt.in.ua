import type { SqlConnection } from "@/lib/db/mysql";
import { sampleRandomIds } from "@/lib/sampleRandomIds";
import {
  SESSION_STATUS_CREATED,
  SESSION_STATUS_PLANNED,
} from "@/modules/sessions/types";

import { TOPIC_TEST_TASK_COUNT } from "./startTopicTest";

const TASK_TYPE_TOPIC = 1;
const TASK_STATUS_UNANSWERED = 0;

const SQL_SELECT_SESSION = `
  SELECT id, user_id, theme_id, session_status
  FROM task_sessions
  WHERE id = ? AND user_id = ?
  FOR UPDATE
`;

const SQL_COUNT_MAPPINGS = `
  SELECT COUNT(*) AS mapping_count
  FROM tasks2session
  WHERE session_id = ?
`;

const SQL_SELECT_TASK_IDS = `SELECT id FROM quiz_tasks WHERE theme_id = ?`;

const SQL_INSERT_MAPPING_PREFIX =
  "INSERT INTO tasks2session (task_type, task_id, session_id, user_id, status) VALUES ";

const SQL_UPDATE_SESSION = `
  UPDATE task_sessions
  SET tasks_number = ?, session_status = ?
  WHERE id = ?
`;

export type StartPlannedSessionInput = {
  userId: number;
  sessionId: number;
};

export type StartPlannedSessionResult = {
  sessionId: number;
  themeId: number;
  taskIds: number[];
};

export type StartPlannedSessionErrorCode =
  | "invalid_input"
  | "not_found"
  | "not_planned"
  | "insufficient_tasks"
  | "db_error";

export class StartPlannedSessionError extends Error {
  constructor(
    message: string,
    public readonly code: StartPlannedSessionErrorCode,
  ) {
    super(message);
    this.name = "StartPlannedSessionError";
  }
}

type StartPlannedSessionDeps = {
  getConnection: () => Promise<SqlConnection>;
};

type SessionRow = {
  id: number;
  user_id: number;
  theme_id: number;
  session_status: number;
};

type CountRow = {
  mapping_count: number;
};

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function validateStartPlannedSessionInput(
  input: unknown,
): StartPlannedSessionInput {
  if (typeof input !== "object" || input === null) {
    throw new StartPlannedSessionError(
      "Request payload must be an object.",
      "invalid_input",
    );
  }
  const { userId, sessionId } = input as Record<string, unknown>;
  if (!isPositiveInt(userId) || !isPositiveInt(sessionId)) {
    throw new StartPlannedSessionError(
      "userId and sessionId must be positive integers.",
      "invalid_input",
    );
  }
  return { userId, sessionId };
}

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/**
 * Activates a planned session: picks tasks for its theme, inserts mappings,
 * and moves `session_status` from planned to created.
 */
export async function startPlannedSession(
  rawInput: unknown,
  deps: StartPlannedSessionDeps = { getConnection: loadDefaultConnection },
): Promise<StartPlannedSessionResult> {
  const input = validateStartPlannedSessionInput(rawInput);

  try {
    const connection = await deps.getConnection();
    try {
      await connection.beginTransaction();

      const sessions = await connection.query<SessionRow>(SQL_SELECT_SESSION, [
        input.sessionId,
        input.userId,
      ]);
      const session = sessions[0];

      if (!session) {
        await connection.rollback();
        throw new StartPlannedSessionError(
          "Session was not found for this user.",
          "not_found",
        );
      }

      const counts = await connection.query<CountRow>(SQL_COUNT_MAPPINGS, [
        input.sessionId,
      ]);
      const mappingCount = counts[0]?.mapping_count ?? 0;

      if (mappingCount > 0) {
        await connection.commit();
        return {
          sessionId: session.id,
          themeId: session.theme_id,
          taskIds: [],
        };
      }

      if (session.session_status !== SESSION_STATUS_PLANNED) {
        await connection.rollback();
        throw new StartPlannedSessionError(
          "Only planned sessions can be started this way.",
          "not_planned",
        );
      }

      const pool = await connection.query<{ id: number }>(SQL_SELECT_TASK_IDS, [
        session.theme_id,
      ]);
      const taskIds = sampleRandomIds(
        pool.map((row) => row.id),
        TOPIC_TEST_TASK_COUNT,
      );
      const taskCount = taskIds.length;

      if (taskCount === 0) {
        await connection.rollback();
        throw new StartPlannedSessionError(
          "No tasks available for the session theme.",
          "insufficient_tasks",
        );
      }

      const placeholders = taskIds.map(() => "(?, ?, ?, ?, ?)").join(", ");
      const mappingParams = taskIds.flatMap((taskId) => [
        TASK_TYPE_TOPIC,
        taskId,
        session.id,
        input.userId,
        TASK_STATUS_UNANSWERED,
      ]);
      const mapping = await connection.execute(
        SQL_INSERT_MAPPING_PREFIX + placeholders,
        mappingParams,
      );

      if (mapping.affectedRows !== taskCount) {
        await connection.rollback();
        throw new StartPlannedSessionError(
          "Failed to link all tasks to the planned session.",
          "db_error",
        );
      }

      const updated = await connection.execute(SQL_UPDATE_SESSION, [
        taskCount,
        SESSION_STATUS_CREATED,
        session.id,
      ]);
      if (updated.affectedRows !== 1) {
        await connection.rollback();
        throw new StartPlannedSessionError(
          "Failed to activate the planned session.",
          "db_error",
        );
      }

      await connection.commit();
      return {
        sessionId: session.id,
        themeId: session.theme_id,
        taskIds,
      };
    } catch (error) {
      if (!(error instanceof StartPlannedSessionError)) {
        await connection.rollback().catch(() => undefined);
      }
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof StartPlannedSessionError) {
      throw error;
    }
    console.error("startPlannedSession: unexpected database error", error);
    throw new StartPlannedSessionError("Database operation failed.", "db_error");
  }
}
