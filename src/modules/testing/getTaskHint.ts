import type { SqlConnection } from "@/lib/db/mysql";
import { TASK_STATUS_INCORRECT } from "./types";

/** Verified `tasks2session.task_type` for the topic-test bank (`quiz_tasks`). */
const TASK_TYPE_TOPIC = 1;
/** Verified `task_sessions.session_type` values that never get a Practice
 * hint: 4 = NMT simulator (own bank/flow), 5 = diagnostic (must stay
 * neutral — see AGENTS.md). User/auto/mentor topic tests (1/2/3) all share
 * the same immediate-feedback trainer UI and are the only types eligible. */
const INELIGIBLE_SESSION_TYPES = [4, 5];

const SQL_SELECT_HINT = `
  SELECT t2s.status, t2s.task_type, ts.session_type, qt.comments
  FROM tasks2session t2s
  INNER JOIN task_sessions ts ON ts.id = t2s.session_id
  INNER JOIN quiz_tasks qt ON qt.id = t2s.task_id
  WHERE t2s.id = ? AND t2s.session_id = ? AND t2s.user_id = ?
`;

export type GetTaskHintInput = {
  userId: number;
  sessionId: number;
  mappingId: number;
};

export type GetTaskHintResult = {
  available: boolean;
  hint: string | null;
};

export type GetTaskHintErrorCode = "invalid_input" | "not_found" | "db_error";

export class GetTaskHintError extends Error {
  constructor(
    message: string,
    public readonly code: GetTaskHintErrorCode,
  ) {
    super(message);
    this.name = "GetTaskHintError";
  }
}

type HintRow = {
  status: number;
  task_type: number;
  session_type: number;
  comments: string | null;
};

type GetTaskHintDeps = {
  getConnection: () => Promise<SqlConnection>;
};

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/**
 * Practice mode's "Show hint": reuses the existing `quiz_tasks.comments`
 * explanation field (already shown post-session in the mistake review),
 * surfaced per-task once the student has answered it incorrectly. Never
 * fabricates content — a task imported without comments simply has no hint.
 *
 * Never available before the task is checked (same rule as
 * `right_answer_n`/`comments` everywhere else — never sent to the client
 * ahead of a check or session finish), on a correct or unanswered task, or
 * for diagnostic/NMT sessions.
 */
export async function getTaskHint(
  input: GetTaskHintInput,
  deps: GetTaskHintDeps = { getConnection: loadDefaultConnection },
): Promise<GetTaskHintResult> {
  if (
    !isPositiveInt(input.userId) ||
    !isPositiveInt(input.sessionId) ||
    !isPositiveInt(input.mappingId)
  ) {
    throw new GetTaskHintError(
      "userId, sessionId and mappingId must be positive integers.",
      "invalid_input",
    );
  }

  try {
    const connection = await deps.getConnection();
    try {
      const rows = await connection.query<HintRow>(SQL_SELECT_HINT, [
        input.mappingId,
        input.sessionId,
        input.userId,
      ]);
      const row = rows[0];
      if (!row) {
        throw new GetTaskHintError(
          "Task mapping was not found in this session.",
          "not_found",
        );
      }

      const eligible =
        row.task_type === TASK_TYPE_TOPIC &&
        !INELIGIBLE_SESSION_TYPES.includes(row.session_type) &&
        row.status === TASK_STATUS_INCORRECT;

      const comment = row.comments?.trim() || "";
      if (!eligible || comment === "") {
        return { available: false, hint: null };
      }
      return { available: true, hint: comment };
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof GetTaskHintError) throw error;
    console.error("getTaskHint: unexpected database error", error);
    throw new GetTaskHintError("Database operation failed.", "db_error");
  }
}
