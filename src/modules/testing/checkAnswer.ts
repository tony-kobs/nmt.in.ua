import type { SqlConnection } from "@/lib/db/mysql";
import { SESSION_STATUS_COMPLETED } from "@/modules/sessions/types";
import { nowUnixSec } from "./sessionElapsed";
import { isSessionExpired } from "./sessionExpiry";
import { TASK_TYPE_NMT } from "./startNmtSimulator";
import {
  TASK_STATUS_CORRECT,
  TASK_STATUS_INCORRECT,
  TASK_STATUS_UNANSWERED,
} from "./types";

export {
  TASK_STATUS_CORRECT,
  TASK_STATUS_INCORRECT,
  TASK_STATUS_UNANSWERED,
} from "./types";

/**
 * One round-trip: branch the answer key via LEFT JOIN on `task_type`
 * instead of probing `quiz_tasks` then `nmt_quiz_tasks`.
 */
const SQL_SELECT_MAPPING = `
  SELECT
    t2s.id,
    t2s.session_id,
    t2s.status,
    t2s.user_id,
    t2s.task_type,
    COALESCE(qt.right_answer_n, nqt.right_answer_n) AS right_answer_n,
    nqt.right_answer_text AS right_answer_text,
    COALESCE(nqt.task_kind, 'mcq') AS task_kind,
    ts.session_status,
    ts.expire_time
  FROM tasks2session t2s
  INNER JOIN task_sessions ts ON ts.id = t2s.session_id
  LEFT JOIN quiz_tasks qt
    ON qt.id = t2s.task_id AND t2s.task_type <> ${TASK_TYPE_NMT}
  LEFT JOIN nmt_quiz_tasks nqt
    ON nqt.id = t2s.task_id AND t2s.task_type = ${TASK_TYPE_NMT}
  WHERE t2s.id = ? AND t2s.session_id = ? AND t2s.user_id = ?
  FOR UPDATE
`;

const SQL_UPDATE_STATUS = "UPDATE tasks2session SET status = ? WHERE id = ?";

export type AnswerNumber = 1 | 2 | 3 | 4 | 5;

export type CheckAnswerInput = {
  userId: number;
  sessionId: number;
  mappingId: number;
  answerNumber?: AnswerNumber;
  answerText?: string;
};

export type CheckAnswerResult = {
  correct: boolean;
};

export type CheckAnswerErrorCode =
  | "invalid_input"
  | "not_found"
  | "session_completed"
  | "session_expired"
  | "db_error";

export class CheckAnswerError extends Error {
  constructor(
    message: string,
    public readonly code: CheckAnswerErrorCode,
  ) {
    super(message);
    this.name = "CheckAnswerError";
  }
}

type CheckAnswerDeps = {
  getConnection: () => Promise<SqlConnection>;
  nowSec?: () => number;
};

type MappingRow = {
  id: number;
  session_id: number;
  status: number;
  user_id: number;
  task_type: number;
  right_answer_n: number | null;
  right_answer_text: string | null;
  task_kind: "mcq" | "match" | "open";
  session_status: number;
  expire_time: number;
};

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isAnswerNumber(value: unknown): value is AnswerNumber {
  return (
    value === 1 ||
    value === 2 ||
    value === 3 ||
    value === 4 ||
    value === 5
  );
}

function normalizeAnswerText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "").replace(/,/g, ".");
}

export function validateCheckAnswerInput(input: unknown): CheckAnswerInput {
  if (typeof input !== "object" || input === null) {
    throw new CheckAnswerError(
      "Request payload must be an object.",
      "invalid_input",
    );
  }
  const { userId, sessionId, mappingId, answerNumber, answerText } =
    input as Record<string, unknown>;

  const hasNumber = isAnswerNumber(answerNumber);
  const hasText =
    typeof answerText === "string" && answerText.trim().length > 0;

  if (
    !isPositiveInt(userId) ||
    !isPositiveInt(sessionId) ||
    !isPositiveInt(mappingId) ||
    (!hasNumber && !hasText)
  ) {
    throw new CheckAnswerError(
      "sessionId, mappingId must be positive integers and an answer must be provided.",
      "invalid_input",
    );
  }

  return {
    userId,
    sessionId,
    mappingId,
    ...(hasNumber ? { answerNumber } : {}),
    ...(hasText ? { answerText: String(answerText) } : {}),
  };
}

function resultFromStatus(status: number): CheckAnswerResult {
  return { correct: status === TASK_STATUS_CORRECT };
}

function isCorrect(row: MappingRow, input: CheckAnswerInput): boolean {
  if (row.task_kind === "mcq") {
    return (
      input.answerNumber != null &&
      row.right_answer_n != null &&
      input.answerNumber === row.right_answer_n
    );
  }
  if (!input.answerText || !row.right_answer_text) return false;
  return (
    normalizeAnswerText(input.answerText) ===
    normalizeAnswerText(row.right_answer_text)
  );
}

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/**
 * Compares the chosen option / text with the server key and writes
 * `tasks2session.status`. Already-answered rows are returned as-is.
 * Topic tasks live in `quiz_tasks`; simulator tasks in `nmt_quiz_tasks`.
 */
export async function checkAnswer(
  rawInput: unknown,
  deps: CheckAnswerDeps = { getConnection: loadDefaultConnection },
): Promise<CheckAnswerResult> {
  const input = validateCheckAnswerInput(rawInput);

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
        throw new CheckAnswerError(
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
        throw new CheckAnswerError(
          "This session is already completed.",
          "session_completed",
        );
      }

      const nowSec = deps.nowSec ?? nowUnixSec;
      if (isSessionExpired(row.expire_time, nowSec())) {
        await connection.rollback();
        throw new CheckAnswerError(
          "This session's 24h lifetime has expired.",
          "session_expired",
        );
      }

      // Mapping row exists but neither bank table joined (orphan task_id).
      if (row.right_answer_n == null && row.right_answer_text == null) {
        await connection.rollback();
        throw new CheckAnswerError(
          "Task mapping was not found in this session.",
          "not_found",
        );
      }

      const status = isCorrect(row, input)
        ? TASK_STATUS_CORRECT
        : TASK_STATUS_INCORRECT;

      const updated = await connection.execute(SQL_UPDATE_STATUS, [
        status,
        row.id,
      ]);
      if (updated.affectedRows !== 1) {
        await connection.rollback();
        throw new CheckAnswerError(
          "Failed to store the answer status.",
          "db_error",
        );
      }

      await connection.commit();
      return resultFromStatus(status);
    } catch (error) {
      if (!(error instanceof CheckAnswerError)) {
        await connection.rollback().catch(() => undefined);
      }
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof CheckAnswerError) throw error;
    console.error("checkAnswer: unexpected database error", error);
    throw new CheckAnswerError("Database operation failed.", "db_error");
  }
}
