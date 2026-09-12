import type { SqlConnection } from "@/lib/db/mysql";
import { SESSION_STATUS_COMPLETED } from "@/modules/sessions/types";
import { nowUnixSec } from "@/modules/testing/sessionElapsed";
import { isSessionExpired } from "@/modules/testing/sessionExpiry";
import { isValidOwner, ownerClause, ownerParams, type SessionOwner } from "./sessionOwner";

const SESSION_TYPE_DIAGNOSTIC = 5;

const SQL_SELECT_SESSION = `
  SELECT id, start_time, session_status, expire_time
  FROM task_sessions
  WHERE id = ? AND session_type = ${SESSION_TYPE_DIAGNOSTIC} AND ${ownerClause("task_sessions")}
  FOR UPDATE
`;

const SQL_UPDATE_START_TIME = `
  UPDATE task_sessions
  SET start_time = ?
  WHERE id = ? AND start_time = 0
`;

export type MarkDiagnosticSessionStartedInput = {
  owner: SessionOwner;
  sessionId: number;
};

export type MarkDiagnosticSessionStartedResult = { startTime: number };

export type MarkDiagnosticSessionStartedErrorCode =
  | "invalid_input"
  | "not_found"
  | "session_expired"
  | "db_error";

export class MarkDiagnosticSessionStartedError extends Error {
  constructor(
    message: string,
    public readonly code: MarkDiagnosticSessionStartedErrorCode,
  ) {
    super(message);
    this.name = "MarkDiagnosticSessionStartedError";
  }
}

type MarkDiagnosticSessionStartedDeps = {
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

export function validateMarkDiagnosticSessionStartedInput(
  input: unknown,
): MarkDiagnosticSessionStartedInput {
  if (typeof input !== "object" || input === null) {
    throw new MarkDiagnosticSessionStartedError(
      "Request payload must be an object.",
      "invalid_input",
    );
  }
  const { owner, sessionId } = input as Record<string, unknown>;
  if (!isValidOwner(owner) || !isPositiveInt(sessionId)) {
    throw new MarkDiagnosticSessionStartedError(
      "owner must be valid and sessionId must be a positive integer.",
      "invalid_input",
    );
  }
  return { owner: owner as SessionOwner, sessionId };
}

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/**
 * Owner-aware analog of `src/modules/testing/markSessionStarted.ts` for
 * diagnostic (session_type=5) sessions.
 */
export async function markDiagnosticSessionStarted(
  rawInput: unknown,
  deps: MarkDiagnosticSessionStartedDeps = {
    getConnection: loadDefaultConnection,
  },
): Promise<MarkDiagnosticSessionStartedResult> {
  const input = validateMarkDiagnosticSessionStartedInput(rawInput);
  const nowSec = deps.nowSec ?? nowUnixSec;

  try {
    const connection = await deps.getConnection();
    try {
      await connection.beginTransaction();

      const rows = await connection.query<SessionRow>(SQL_SELECT_SESSION, [
        input.sessionId,
        ...ownerParams(input.owner),
      ]);
      const session = rows[0];

      if (!session) {
        await connection.rollback();
        throw new MarkDiagnosticSessionStartedError(
          "Session was not found for this owner.",
          "not_found",
        );
      }

      if (session.session_status === SESSION_STATUS_COMPLETED) {
        await connection.commit();
        return { startTime: session.start_time };
      }

      if (isSessionExpired(session.expire_time, nowSec())) {
        await connection.rollback();
        throw new MarkDiagnosticSessionStartedError(
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
        throw new MarkDiagnosticSessionStartedError(
          "Failed to store the session start time.",
          "db_error",
        );
      }

      await connection.commit();
      return { startTime };
    } catch (error) {
      if (!(error instanceof MarkDiagnosticSessionStartedError)) {
        await connection.rollback().catch(() => undefined);
      }
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof MarkDiagnosticSessionStartedError) {
      throw error;
    }
    console.error(
      "markDiagnosticSessionStarted: unexpected database error",
      error,
    );
    throw new MarkDiagnosticSessionStartedError(
      "Database operation failed.",
      "db_error",
    );
  }
}
