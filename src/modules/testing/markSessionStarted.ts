import type { SqlConnection } from "@/lib/db/mysql";
import { SESSION_STATUS_COMPLETED } from "@/modules/sessions/types";
import { nowUnixSec } from "./sessionElapsed";
import { isSessionExpired } from "./sessionExpiry";

const SQL_SELECT_SESSION = `
  SELECT id, start_time, session_status, expire_time
  FROM task_sessions
  WHERE id = ? AND user_id = ?
  FOR UPDATE
`;

const SQL_UPDATE_START_TIME = `
  UPDATE task_sessions
  SET start_time = ?
  WHERE id = ? AND start_time = 0
`;

export type MarkSessionStartedInput = {
  userId: number;
  sessionId: number;
};

export type MarkSessionStartedResult = {
  startTime: number;
};

export type MarkSessionStartedErrorCode =
  | "invalid_input"
  | "not_found"
  | "session_expired"
  | "db_error";

export class MarkSessionStartedError extends Error {
  constructor(
    message: string,
    public readonly code: MarkSessionStartedErrorCode,
  ) {
    super(message);
    this.name = "MarkSessionStartedError";
  }
}

type MarkSessionStartedDeps = {
  getConnection: () => Promise<SqlConnection>;
  nowSec?: () => number;
};

type SessionRow = {
  id: number;
  start_time: number;
  session_status: number;
  expire_time: number;
};

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function validateMarkSessionStartedInput(
  input: unknown,
): MarkSessionStartedInput {
  if (typeof input !== "object" || input === null) {
    throw new MarkSessionStartedError(
      "Request payload must be an object.",
      "invalid_input",
    );
  }
  const { userId, sessionId } = input as Record<string, unknown>;
  if (!isPositiveInt(userId) || !isPositiveInt(sessionId)) {
    throw new MarkSessionStartedError(
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
 * Records `task_sessions.start_time` on first trainer entry. Idempotent:
 * a non-zero start_time is left as-is so a refresh does not reset the clock.
 */
export async function markSessionStarted(
  rawInput: unknown,
  deps: MarkSessionStartedDeps = { getConnection: loadDefaultConnection },
): Promise<MarkSessionStartedResult> {
  const input = validateMarkSessionStartedInput(rawInput);
  const nowSec = deps.nowSec ?? nowUnixSec;

  try {
    const connection = await deps.getConnection();
    try {
      await connection.beginTransaction();

      const rows = await connection.query<SessionRow>(SQL_SELECT_SESSION, [
        input.sessionId,
        input.userId,
      ]);
      const session = rows[0];

      if (!session) {
        await connection.rollback();
        throw new MarkSessionStartedError(
          "Session was not found for this user.",
          "not_found",
        );
      }

      if (session.session_status === SESSION_STATUS_COMPLETED) {
        await connection.commit();
        return { startTime: session.start_time };
      }

      if (isSessionExpired(session.expire_time, nowSec())) {
        await connection.rollback();
        throw new MarkSessionStartedError(
          "This session's 24h lifetime has expired.",
          "session_expired",
        );
      }

      if (session.start_time > 0) {
        await connection.commit();
        return { startTime: session.start_time };
      }

      const startTime = nowSec();
      const updated = await connection.execute(SQL_UPDATE_START_TIME, [
        startTime,
        session.id,
      ]);
      if (updated.affectedRows !== 1) {
        await connection.rollback();
        throw new MarkSessionStartedError(
          "Failed to store the session start time.",
          "db_error",
        );
      }

      await connection.commit();
      return { startTime };
    } catch (error) {
      if (!(error instanceof MarkSessionStartedError)) {
        await connection.rollback().catch(() => undefined);
      }
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof MarkSessionStartedError) {
      throw error;
    }
    console.error("markSessionStarted: unexpected database error", error);
    throw new MarkSessionStartedError(
      "Database operation failed.",
      "db_error",
    );
  }
}
