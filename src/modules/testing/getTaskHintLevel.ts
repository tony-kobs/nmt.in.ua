import type { SqlConnection } from "@/lib/db/mysql";
import { SESSION_STATUS_COMPLETED } from "@/modules/sessions/types";
import { nowUnixSec } from "./sessionElapsed";
import { isSessionExpired } from "./sessionExpiry";
import { TASK_STATUS_INCORRECT } from "./types";

/** Verified `tasks2session.task_type` for the topic-test bank (`quiz_tasks`). */
const TASK_TYPE_TOPIC = 1;
/** Same ineligible `task_sessions.session_type` values as `getTaskHint.ts` /
 * `addSimilarPracticeTask.ts` / `checkAnswer.ts` — 4 = NMT simulator, 5 =
 * diagnostic (must stay neutral — see AGENTS.md). */
const INELIGIBLE_SESSION_TYPES = [4, 5];

export type HintLevel = 1 | 2 | 3;

const SQL_SELECT_HINT = `
  SELECT
    t2s.status,
    t2s.task_type,
    t2s.hint_level_unlocked,
    t2s.retry_used,
    ts.session_type,
    ts.session_status,
    ts.expire_time,
    qt.hint_direction,
    qt.hint_rule,
    qt.hint_example,
    qt.comments
  FROM tasks2session t2s
  INNER JOIN task_sessions ts ON ts.id = t2s.session_id
  INNER JOIN quiz_tasks qt ON qt.id = t2s.task_id
  WHERE t2s.id = ? AND t2s.session_id = ? AND t2s.user_id = ?
  FOR UPDATE
`;

const SQL_UPDATE_UNLOCKED =
  "UPDATE tasks2session SET hint_level_unlocked = ? WHERE id = ?";

export type GetTaskHintLevelInput = {
  userId: number;
  sessionId: number;
  mappingId: number;
  /** The rung the student is asking for — must be exactly one more than
   * whatever is already unlocked for this row (or `<=` it, to re-fetch a
   * rung already shown). Requesting ahead (e.g. level 3 before level 1) is
   * rejected — see `not_eligible`. */
  level: HintLevel;
};

export type GetTaskHintLevelResult = {
  available: boolean;
  level: HintLevel | null;
  text: string | null;
  /** `true` once this rung is the last one this task has to offer — either
   * genuinely rung 3, or an earlier rung that had to fall back to the
   * `comments` explanation because the task has no ladder authored. */
  isFinal: boolean;
};

export type GetTaskHintLevelErrorCode =
  | "invalid_input"
  | "not_found"
  | "not_eligible"
  | "session_expired"
  | "db_error";

export class GetTaskHintLevelError extends Error {
  constructor(
    message: string,
    public readonly code: GetTaskHintLevelErrorCode,
  ) {
    super(message);
    this.name = "GetTaskHintLevelError";
  }
}

type HintRow = {
  status: number;
  task_type: number;
  hint_level_unlocked: number;
  retry_used: number;
  session_type: number;
  session_status: number;
  expire_time: number;
  hint_direction: string | null;
  hint_rule: string | null;
  hint_example?: string | null;
  comments: string | null;
};

type GetTaskHintLevelDeps = {
  getConnection: () => Promise<SqlConnection>;
  nowSec?: () => number;
};

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isHintLevel(value: unknown): value is HintLevel {
  return value === 1 || value === 2 || value === 3;
}

/**
 * Authored analogous examples never reveal the current answer.
 * A missing later rung falls back to `comments` only after the retry, so the
 * ladder does not skip straight to the worked solution.
 * A task with no ladder at all stores its hint in `comments` (the admin
 * field «Підказка / коментар»). The button is only on screen while the
 * retry is still open, so that text has to come back on the first click.
 */
function resolveRung(
  row: HintRow,
  level: HintLevel,
  retryConsumed: boolean,
): { text: string | null; isFinal: boolean } {
  const direction = row.hint_direction?.trim() || null;
  const rule = row.hint_rule?.trim() || null;
  const example = row.hint_example?.trim() || null;
  const explanation = row.comments?.trim() || null;
  const explanationGate = (): { text: string | null; isFinal: boolean } =>
    retryConsumed ? { text: explanation, isFinal: true } : { text: null, isFinal: false };

  if (direction == null) {
    return { text: explanation, isFinal: true };
  }
  if (level === 1) {
    return { text: direction, isFinal: false };
  }
  if (level === 2) {
    return rule != null ? { text: rule, isFinal: false } : explanationGate();
  }
  return example != null ? { text: example, isFinal: true } : explanationGate();
}

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/**
 * Practice mode's 3-rung hint ladder (direction → rule → worked example):
 * each rung must be requested explicitly and in order — `hint_level_unlocked`
 * is the server-enforced ratchet so a client can never skip straight to the
 * worked example. Same eligibility as `getTaskHint.ts` (topic bank, Practice
 * session, already answered incorrectly) and never fabricates ladder content
 * for a legacy task missing the new columns.
 */
export async function getTaskHintLevel(
  input: GetTaskHintLevelInput,
  deps: GetTaskHintLevelDeps = { getConnection: loadDefaultConnection },
): Promise<GetTaskHintLevelResult> {
  if (
    !isPositiveInt(input.userId) ||
    !isPositiveInt(input.sessionId) ||
    !isPositiveInt(input.mappingId) ||
    !isHintLevel(input.level)
  ) {
    throw new GetTaskHintLevelError(
      "userId, sessionId and mappingId must be positive integers and level must be 1, 2 or 3.",
      "invalid_input",
    );
  }

  try {
    const connection = await deps.getConnection();
    try {
      await connection.beginTransaction();

      const rows = await connection.query<HintRow>(SQL_SELECT_HINT, [
        input.mappingId,
        input.sessionId,
        input.userId,
      ]);
      const row = rows[0];
      if (!row) {
        await connection.rollback();
        throw new GetTaskHintLevelError(
          "Task mapping was not found in this session.",
          "not_found",
        );
      }

      const nowSec = deps.nowSec ?? nowUnixSec;
      if (
        row.session_status !== SESSION_STATUS_COMPLETED &&
        isSessionExpired(row.expire_time, nowSec())
      ) {
        await connection.rollback();
        throw new GetTaskHintLevelError(
          "This session's 24h lifetime has expired.",
          "session_expired",
        );
      }

      const eligible =
        row.task_type === TASK_TYPE_TOPIC &&
        !INELIGIBLE_SESSION_TYPES.includes(row.session_type) &&
        row.status === TASK_STATUS_INCORRECT;

      if (!eligible) {
        await connection.commit();
        return { available: false, level: null, text: null, isFinal: false };
      }

      if (input.level > row.hint_level_unlocked + 1) {
        await connection.rollback();
        throw new GetTaskHintLevelError(
          "Hint rungs must be requested in order.",
          "not_eligible",
        );
      }

      const { text, isFinal } = resolveRung(row, input.level, row.retry_used === 1);

      if (text == null) {
        await connection.commit();
        return { available: false, level: null, text: null, isFinal: false };
      }

      const nextUnlocked = Math.max(row.hint_level_unlocked, input.level);
      if (nextUnlocked !== row.hint_level_unlocked) {
        await connection.execute(SQL_UPDATE_UNLOCKED, [
          nextUnlocked,
          input.mappingId,
        ]);
      }

      await connection.commit();
      return { available: true, level: input.level, text, isFinal };
    } catch (error) {
      if (!(error instanceof GetTaskHintLevelError)) {
        await connection.rollback().catch(() => undefined);
      }
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof GetTaskHintLevelError) throw error;
    console.error("getTaskHintLevel: unexpected database error", error);
    throw new GetTaskHintLevelError("Database operation failed.", "db_error");
  }
}
