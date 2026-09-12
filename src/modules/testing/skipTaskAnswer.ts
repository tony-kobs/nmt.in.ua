import type { SqlConnection } from "@/lib/db/mysql";
import { SESSION_STATUS_COMPLETED } from "@/modules/sessions/types";
import { nowUnixSec } from "./sessionElapsed";
import { isSessionExpired } from "./sessionExpiry";
import {
  TASK_STATUS_INCORRECT,
  TASK_STATUS_UNANSWERED,
} from "./types";

const SQL_SELECT_MAPPING = `
  SELECT
    t2s.id,
    t2s.status,
    ts.session_status,
    ts.expire_time
  FROM tasks2session t2s
  INNER JOIN task_sessions ts ON ts.id = t2s.session_id
  WHERE t2s.id = ? AND t2s.session_id = ? AND t2s.user_id = ?
  FOR UPDATE
`;

const SQL_UPDATE_STATUS = "UPDATE tasks2session SET status = ? WHERE id = ?";

export type SkipTaskAnswerInput = {
  userId: number;
  sessionId: number;
  mappingId: number;
};

export type SkipTaskAnswerResult = {
  correct: false;
};

export type SkipTaskAnswerErrorCode =
  | "invalid_input"
  | "not_found"
  | "session_completed"
  | "session_expired"
  | "db_error";

export class SkipTaskAnswerError extends Error {
  constructor(
    message: string,
    public readonly code: SkipTaskAnswerErrorCode,
  ) {
    super(message);
    this.name = "SkipTaskAnswerError";
  }
}

type SkipTaskAnswerDeps = {
  getConnection: () => Promise<SqlConnection>;
  nowSec?: () => number;
};

type MappingRow = {
  id: number;
  status: number;
  session_status: number;
  expire_time: number;
};

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function validateSkipTaskAnswerInput(input: unknown): SkipTaskAnswerInput {
  if (typeof input !== "object" || input === null) {
    throw new SkipTaskAnswerError(
      "Request payload must be an object.",
      "invalid_input",
    );
  }
  const { userId, sessionId, mappingId } = input as Record<string, unknown>;
  if (!isPositiveInt(userId) || !isPositiveInt(sessionId) || !isPositiveInt(mappingId)) {
    throw new SkipTaskAnswerError(
      "userId, sessionId and mappingId must be positive integers.",
      "invalid_input",
    );
  }
  return { userId, sessionId, mappingId };
}

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/** Marks an unanswered mapping as incorrect (Ultimate skip / timeout). */
export async function skipTaskAnswer(
  rawInput: unknown,
  deps: SkipTaskAnswerDeps = { getConnection: loadDefaultConnection },
): Promise<SkipTaskAnswerResult> {
  const input = validateSkipTaskAnswerInput(rawInput);

  try {
    const connection = await deps.getConnection();
    try {
      await connection.beginTransaction();

      const rows = await connection.query<MappingRow>(SQL_SELECT_MAPPING, [
        input.mappingId,
        input.sessionId,
        input.userId,
      ]);
      const row = rows[0];

      if (!row) {
        await connection.rollback();
        throw new SkipTaskAnswerError(
          "Task mapping was not found in this session.",
          "not_found",
        );
      }

      if (row.status !== TASK_STATUS_UNANSWERED) {
        await connection.commit();
        return { correct: false };
      }

      if (row.session_status === SESSION_STATUS_COMPLETED) {
        await connection.rollback();
        throw new SkipTaskAnswerError(
          "This session is already completed.",
          "session_completed",
        );
      }

      const nowSec = deps.nowSec ?? nowUnixSec;
      if (isSessionExpired(row.expire_time, nowSec())) {
        await connection.rollback();
        throw new SkipTaskAnswerError(
          "This session's 24h lifetime has expired.",
          "session_expired",
        );
      }

      const updated = await connection.execute(SQL_UPDATE_STATUS, [
        TASK_STATUS_INCORRECT,
        row.id,
      ]);
      if (updated.affectedRows !== 1) {
        await connection.rollback();
        throw new SkipTaskAnswerError(
          "Failed to store the skipped task status.",
          "db_error",
        );
      }

      await connection.commit();
      return { correct: false };
    } catch (error) {
      if (!(error instanceof SkipTaskAnswerError)) {
        await connection.rollback().catch(() => undefined);
      }
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof SkipTaskAnswerError) {
      throw error;
    }
    console.error("skipTaskAnswer: unexpected database error", error);
    throw new SkipTaskAnswerError("Database operation failed.", "db_error");
  }
}
