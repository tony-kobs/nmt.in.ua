import type { SqlConnection } from "@/lib/db/mysql";
import { SESSION_STATUS_COMPLETED } from "@/modules/sessions/types";
import { nowUnixSec } from "@/modules/testing/sessionElapsed";
import { isSessionExpired } from "@/modules/testing/sessionExpiry";
import {
  TASK_STATUS_CORRECT,
  TASK_STATUS_INCORRECT,
  TASK_STATUS_UNANSWERED,
} from "@/modules/testing/types";
import { isValidOwner, ownerClause, ownerParams, type SessionOwner } from "./sessionOwner";

const SESSION_TYPE_DIAGNOSTIC = 5;

const SQL_SELECT_MAPPING = `
  SELECT
    t2s.id,
    t2s.session_id,
    t2s.status,
    qt.right_answer_n,
    ts.session_status,
    ts.expire_time
  FROM tasks2session t2s
  INNER JOIN quiz_tasks qt ON qt.id = t2s.task_id
  INNER JOIN task_sessions ts ON ts.id = t2s.session_id
  WHERE t2s.id = ? AND t2s.session_id = ? AND ts.session_type = ${SESSION_TYPE_DIAGNOSTIC}
    AND ${ownerClause("t2s")}
  FOR UPDATE
`;

const SQL_UPDATE_STATUS = "UPDATE tasks2session SET status = ? WHERE id = ?";

export type AnswerNumber = 1 | 2 | 3 | 4;

export type CheckDiagnosticAnswerInput = {
  owner: SessionOwner;
  sessionId: number;
  mappingId: number;
  answerNumber: AnswerNumber;
};

export type CheckDiagnosticAnswerResult = { correct: boolean };

export type CheckDiagnosticAnswerErrorCode =
  | "invalid_input"
  | "not_found"
  | "session_completed"
  | "session_expired"
  | "db_error";

export class CheckDiagnosticAnswerError extends Error {
  constructor(
    message: string,
    public readonly code: CheckDiagnosticAnswerErrorCode,
  ) {
    super(message);
    this.name = "CheckDiagnosticAnswerError";
  }
}

type CheckDiagnosticAnswerDeps = {
  getConnection: () => Promise<SqlConnection>;
  nowSec?: () => number;
};

type MappingRow = {
  id: number;
  session_id: number;
  status: number;
  right_answer_n: number;
  session_status: number;
  expire_time: number;
};

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isAnswerNumber(value: unknown): value is AnswerNumber {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

export function validateCheckDiagnosticAnswerInput(
  input: unknown,
): CheckDiagnosticAnswerInput {
  if (typeof input !== "object" || input === null) {
    throw new CheckDiagnosticAnswerError(
      "Request payload must be an object.",
      "invalid_input",
    );
  }
  const { owner, sessionId, mappingId, answerNumber } = input as Record<
    string,
    unknown
  >;
  if (
    !isValidOwner(owner) ||
    !isPositiveInt(sessionId) ||
    !isPositiveInt(mappingId) ||
    !isAnswerNumber(answerNumber)
  ) {
    throw new CheckDiagnosticAnswerError(
      "owner must be valid; sessionId, mappingId must be positive integers and answerNumber must be 1-4.",
      "invalid_input",
    );
  }
  return {
    owner: owner as SessionOwner,
    sessionId,
    mappingId,
    answerNumber,
  };
}

function resultFromStatus(status: number): CheckDiagnosticAnswerResult {
  return { correct: status === TASK_STATUS_CORRECT };
}

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/**
 * Owner-aware analog of `src/modules/testing/checkAnswer.ts` for diagnostic
 * (session_type=5) sessions. Kept as a separate module rather than editing
 * checkAnswer.ts in place — that module's tests assert exact SQL/params for
 * the authenticated-only path and must stay untouched.
 */
export async function checkDiagnosticAnswer(
  rawInput: unknown,
  deps: CheckDiagnosticAnswerDeps = { getConnection: loadDefaultConnection },
): Promise<CheckDiagnosticAnswerResult> {
  const input = validateCheckDiagnosticAnswerInput(rawInput);

  try {
    const connection = await deps.getConnection();
    try {
      await connection.beginTransaction();

      const rows = await connection.query<MappingRow>(SQL_SELECT_MAPPING, [
        input.mappingId,
        input.sessionId,
        ...ownerParams(input.owner),
      ]);
      const row = rows[0];

      if (!row) {
        await connection.rollback();
        throw new CheckDiagnosticAnswerError(
          "Task mapping was not found in this session.",
          "not_found",
        );
      }

      if (row.status !== TASK_STATUS_UNANSWERED) {
        await connection.commit();
        return resultFromStatus(row.status);
      }

      if (row.session_status === SESSION_STATUS_COMPLETED) {
        await connection.rollback();
        throw new CheckDiagnosticAnswerError(
          "This session is already completed.",
          "session_completed",
        );
      }

      const nowSec = deps.nowSec ?? nowUnixSec;
      if (isSessionExpired(row.expire_time, nowSec())) {
        await connection.rollback();
        throw new CheckDiagnosticAnswerError(
          "This session's 24h lifetime has expired.",
          "session_expired",
        );
      }

      const status =
        input.answerNumber === row.right_answer_n
          ? TASK_STATUS_CORRECT
          : TASK_STATUS_INCORRECT;

      const updated = await connection.execute(SQL_UPDATE_STATUS, [
        status,
        row.id,
      ]);
      if (updated.affectedRows !== 1) {
        await connection.rollback();
        throw new CheckDiagnosticAnswerError(
          "Failed to store the answer status.",
          "db_error",
        );
      }

      await connection.commit();
      return resultFromStatus(status);
    } catch (error) {
      if (!(error instanceof CheckDiagnosticAnswerError)) {
        await connection.rollback().catch(() => undefined);
      }
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof CheckDiagnosticAnswerError) {
      throw error;
    }
    console.error("checkDiagnosticAnswer: unexpected database error", error);
    throw new CheckDiagnosticAnswerError(
      "Database operation failed.",
      "db_error",
    );
  }
}
