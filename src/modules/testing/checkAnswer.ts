import type { SqlConnection } from "@/lib/db/mysql";
import { SESSION_STATUS_COMPLETED } from "@/modules/sessions/types";
import { nowUnixSec } from "./sessionElapsed";
import { isSessionExpired } from "./sessionExpiry";
import { TASK_TYPE_NMT } from "./startNmtSimulator";
import { nextPracticeStreak } from "./practiceAdaptive";
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

/** Verified `tasks2session.task_type` for the topic-test bank (`quiz_tasks`).
 * The second-attempt/reveal flow below is scoped to this bank only — the
 * simulator bank (`nmt_quiz_tasks`, match/open kinds included) keeps its
 * existing single-attempt behavior unchanged. */
const TASK_TYPE_TOPIC = 1;

/** Verified `task_sessions.session_type` values that never get a retry or
 * reveal: 4 = NMT simulator (own bank/flow), 5 = diagnostic (must stay
 * neutral until the whole session finishes — see AGENTS.md). Mirrors the
 * exact same local-constant convention already used in `getTaskHint.ts` /
 * `addSimilarPracticeTask.ts` (Ultimate is not separately identifiable from
 * a standard topic test via `session_type` alone today — same pre-existing
 * gap those two modules already have; not introduced here). */
const INELIGIBLE_SESSION_TYPES = [4, 5];

/**
 * One round-trip: branch the answer key via LEFT JOIN on `task_type`
 * instead of probing `quiz_tasks` then `nmt_quiz_tasks`.
 */
const SQL_SELECT_MAPPING = `
  SELECT
    t2s.id,
    t2s.session_id,
    t2s.status,
    t2s.first_attempt_status,
    t2s.retry_used,
    t2s.user_id,
    t2s.task_type,
    COALESCE(qt.right_answer_n, nqt.right_answer_n) AS right_answer_n,
    nqt.right_answer_text AS right_answer_text,
    COALESCE(nqt.task_kind, 'mcq') AS task_kind,
    qt.comments AS comments,
    qt.answer_1 AS answer_1,
    qt.answer_2 AS answer_2,
    qt.answer_3 AS answer_3,
    qt.answer_4 AS answer_4,
    ts.session_type,
    ts.session_status,
    ts.expire_time,
    ts.practice_streak
  FROM tasks2session t2s
  INNER JOIN task_sessions ts ON ts.id = t2s.session_id
  LEFT JOIN quiz_tasks qt
    ON qt.id = t2s.task_id AND t2s.task_type <> ${TASK_TYPE_NMT}
  LEFT JOIN nmt_quiz_tasks nqt
    ON nqt.id = t2s.task_id AND t2s.task_type = ${TASK_TYPE_NMT}
  WHERE t2s.id = ? AND t2s.session_id = ? AND t2s.user_id = ?
  FOR UPDATE
`;

const SQL_UPDATE_FIRST_ATTEMPT =
  "UPDATE tasks2session SET status = ?, first_attempt_status = ? WHERE id = ?";
const SQL_UPDATE_RETRY =
  "UPDATE tasks2session SET status = ?, retry_used = 1 WHERE id = ?";
const SQL_UPDATE_SESSION_STREAK =
  "UPDATE task_sessions SET practice_streak = ? WHERE id = ?";

export type AnswerNumber = 1 | 2 | 3 | 4 | 5;

export type CheckAnswerInput = {
  userId: number;
  sessionId: number;
  mappingId: number;
  attempt?: 1 | 2;
  answerNumber?: AnswerNumber;
  answerText?: string;
};

export type RevealedAnswer = {
  correctAnswerNumber: number | null;
  correctAnswerText: string | null;
  explanation: string | null;
};

export type CheckAnswerResult = {
  correct: boolean;
  /** True when this call resolved the row's very first attempt (never a
   * retry). Adaptive difficulty / streak progression (`practiceAdaptive.ts`)
   * must only ever advance when this is `true` — a correct answer reached
   * via a hint or the one allowed retry must never count. */
  firstAttempt: boolean;
  /** Present (and `true`) only right after a wrong FIRST attempt on an
   * eligible Practice-mode topic task — the client may resubmit this same
   * `mappingId` once more before it locks. Never present for diagnostic,
   * exam, or non-topic-bank tasks. */
  retryAvailable?: true;
  /** Present only once the task is fully locked after a wrong retry (never
   * before) — the correct answer + explanation, safe to show at that point
   * and idempotent on repeated reads of the same locked row. Never present
   * for diagnostic/exam/non-topic tasks, and never sent ahead of this point. */
  revealed?: RevealedAnswer;
  /** The session's consecutive-correct Practice streak AFTER this call
   * (`task_sessions.practice_streak`), server-tracked — never client-supplied
   * (see `practiceAdaptive.ts`'s `nextPracticeStreak`, called here). Only
   * meaningful for retry-eligible Practice-mode topic tasks; omitted
   * otherwise (diagnostic/exam/non-topic tasks never touch this column). */
  practiceStreak?: number;
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
  first_attempt_status: number | null;
  retry_used: number;
  user_id: number;
  task_type: number;
  right_answer_n: number | null;
  right_answer_text: string | null;
  task_kind: "mcq" | "match" | "open";
  comments: string | null;
  answer_1: string | null;
  answer_2: string | null;
  answer_3: string | null;
  answer_4: string | null;
  session_type: number;
  session_status: number;
  expire_time: number;
  practice_streak: number;
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

const MATCH_CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "c",
  г: "d",
  д: "e",
};

/**
 * Open answers compare as compact decimals (`4,4` = `4.4`). Matching answers
 * compare as `1b;2d;3a`. The trainer shows А Б В Г Д, so a Cyrillic letter
 * after the row number is the same column as the latin code stored in the bank.
 */
export function normalizeAnswerText(value: string): string {
  const compact = value.trim().toLowerCase().replace(/\s+/g, "").replace(/,/g, ".");
  return compact.replace(/(\d)([абвгд])/g, (full, digit: string, letter: string) => {
    const latin = MATCH_CYRILLIC_TO_LATIN[letter];
    return latin ? `${digit}${latin}` : full;
  });
}

export function validateCheckAnswerInput(input: unknown): CheckAnswerInput {
  if (typeof input !== "object" || input === null) {
    throw new CheckAnswerError(
      "Request payload must be an object.",
      "invalid_input",
    );
  }
  const { userId, sessionId, mappingId, answerNumber, answerText, attempt } =
    input as Record<string, unknown>;

  const hasNumber = isAnswerNumber(answerNumber);
  const hasText =
    typeof answerText === "string" && answerText.trim().length > 0;

  if (
    !isPositiveInt(userId) ||
    !isPositiveInt(sessionId) ||
    !isPositiveInt(mappingId) ||
    (attempt !== undefined && attempt !== 1 && attempt !== 2) ||
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
    ...(attempt !== undefined ? { attempt } : {}),
    ...(hasNumber ? { answerNumber } : {}),
    ...(hasText ? { answerText: String(answerText) } : {}),
  };
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

/** Whether this mapping row is eligible for the Practice-mode second
 * attempt / hint-ladder / reveal flow: topic-bank task, in a session type
 * that isn't NMT-simulator or diagnostic. */
function isRetryEligible(row: Pick<MappingRow, "task_type" | "session_type">): boolean {
  return (
    row.task_type === TASK_TYPE_TOPIC &&
    !INELIGIBLE_SESSION_TYPES.includes(row.session_type)
  );
}

function revealFor(row: MappingRow): RevealedAnswer {
  const answerTexts = [row.answer_1, row.answer_2, row.answer_3, row.answer_4];
  const correctAnswerText =
    row.right_answer_n != null
      ? (answerTexts[row.right_answer_n - 1]?.trim() ?? null)
      : null;
  return {
    correctAnswerNumber: row.right_answer_n,
    correctAnswerText,
    explanation: row.comments?.trim() || null,
  };
}

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/**
 * Compares the chosen option / text with the server key and writes
 * `tasks2session.status`. Topic tasks live in `quiz_tasks`; simulator tasks
 * in `nmt_quiz_tasks`.
 *
 * Practice-mode topic tasks additionally get a second attempt: a wrong FIRST
 * attempt leaves the row resubmittable once (`retryAvailable: true`, no
 * answer ever sent); a wrong SECOND attempt locks the row and returns the
 * correct answer + explanation (`revealed`). `first_attempt_status` records
 * the very first outcome permanently — never touched by the retry — so
 * `finishTrainerSession` keeps scoring the primary attempt only. Diagnostic
 * and exam sessions, and every non-topic (simulator) task, keep the exact
 * pre-existing single-attempt behavior.
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

      const retryEligible = isRetryEligible(row);

      if (retryEligible && row.status === TASK_STATUS_UNANSWERED && input.attempt === 2) {
        await connection.rollback();
        throw new CheckAnswerError("First attempt is required.", "invalid_input");
      }

      // Row already locked wrong after a consumed retry: idempotent re-read
      // returns the same reveal every time (already shown to this user for
      // this exact row) rather than erroring on a duplicate/late request.
      if (
        row.status === TASK_STATUS_INCORRECT &&
        row.retry_used === 1 &&
        retryEligible
      ) {
        await connection.commit();
        return {
          correct: false,
          firstAttempt: false,
          revealed: revealFor(row),
        };
      }

      // Second attempt: row is already wrong from its first check, retry not
      // yet consumed, and the row is eligible for the Practice flow.
      if (
        row.status === TASK_STATUS_INCORRECT &&
        row.retry_used === 0 &&
        retryEligible
      ) {
        if (input.attempt !== 2) {
          await connection.commit();
          return { correct: false, firstAttempt: false, retryAvailable: true };
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

        const retryCorrect = isCorrect(row, input);
        const retryStatus = retryCorrect
          ? TASK_STATUS_CORRECT
          : TASK_STATUS_INCORRECT;
        const updated = await connection.execute(SQL_UPDATE_RETRY, [
          retryStatus,
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
        if (retryCorrect) {
          return { correct: true, firstAttempt: false };
        }
        return {
          correct: false,
          firstAttempt: false,
          revealed: revealFor({ ...row, status: TASK_STATUS_INCORRECT }),
        };
      }

      // Already answered (correct, or locked-out row that isn't retry
      // eligible) — same idempotent read-only return as before this change.
      if (row.status !== TASK_STATUS_UNANSWERED) {
        await connection.commit();
        return { correct: row.status === TASK_STATUS_CORRECT, firstAttempt: false };
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

      const updated = await connection.execute(SQL_UPDATE_FIRST_ATTEMPT, [
        status,
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

      // Adaptive-difficulty streak: only a retry-eligible Practice-mode
      // topic task tracks it, and only from THIS branch — by construction
      // this is always the row's first check (hints require an existing
      // wrong status, so they can never have been used yet here), so
      // "correct" at this point is always independent/unaided/first-attempt.
      // A later retry-correct never reaches this branch and never touches
      // the streak (see the retry branch above, which intentionally leaves
      // `practice_streak` untouched — it was already reset to 0 by the
      // first wrong attempt that made the retry possible).
      let nextStreak = row.practice_streak;
      if (retryEligible) {
        nextStreak = nextPracticeStreak(
          row.practice_streak,
          status === TASK_STATUS_CORRECT,
        );
        if (nextStreak !== row.practice_streak) {
          const streakUpdate = await connection.execute(
            SQL_UPDATE_SESSION_STREAK,
            [nextStreak, row.session_id],
          );
          if (streakUpdate.affectedRows !== 1) {
            await connection.rollback();
            throw new CheckAnswerError(
              "Failed to store the updated practice streak.",
              "db_error",
            );
          }
        }
      }

      await connection.commit();

      const streakField = retryEligible ? { practiceStreak: nextStreak } : {};
      if (status === TASK_STATUS_CORRECT) {
        return { correct: true, firstAttempt: true, ...streakField };
      }
      if (retryEligible) {
        return { correct: false, firstAttempt: true, retryAvailable: true, ...streakField };
      }
      return { correct: false, firstAttempt: true };
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
