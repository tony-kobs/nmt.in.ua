import type { SqlConnection } from "@/lib/db/mysql";
import {
  SESSION_STATUS_COMPLETED,
  sessionPercent,
} from "@/modules/sessions/types";
import { nowUnixSec, resolveSessionElapsedSec } from "./sessionElapsed";
import { isSessionExpired } from "./sessionExpiry";
import { nmtMathScaleScore, scoreNmtPaper, type NmtScoreKind } from "./nmtScore";
import { TASK_TYPE_NMT } from "./startNmtSimulator";
import { TASK_STATUS_CORRECT, TASK_STATUS_INCORRECT, TASK_STATUS_UNANSWERED } from "./types";
import type { TrainerSessionSummary } from "./types";

const SQL_SELECT_SESSION = `
  SELECT
    ts.id,
    ts.user_id,
    ts.theme_id,
    ts.tasks_number,
    ts.right_number,
    ts.time,
    ts.start_time,
    ts.session_status,
    ts.session_type,
    ts.expire_time,
    ts.test_points,
    ts.test_points_max,
    COALESCE(t.code, '') AS theme_code,
    COALESCE(t.name, nv.label, 'Симулятор НМТ') AS theme_name
  FROM task_sessions ts
  LEFT JOIN themes t ON t.id = ts.theme_id
  LEFT JOIN nmt_variants nv ON nv.id = ts.nmt_variant_id
  WHERE ts.id = ? AND ts.user_id = ?
  FOR UPDATE
`;

/** `COALESCE(first_attempt_status, status)`: the permanent first-attempt
 * outcome when present (see migration 026), falling back to `status` for
 * legacy rows or non-Practice sessions where the two never diverge. This is
 * what must be scored — a Practice-mode retry/reinforcement/repetition can
 * change `status` afterwards but must never change the stored score. */
const SQL_SELECT_STATUSES = `
  SELECT COALESCE(t2s.first_attempt_status, t2s.status) AS status,
    po.tasks2session_id AS follow_up_id
  FROM tasks2session t2s
  LEFT JOIN practice_task_origin po ON po.tasks2session_id = t2s.id
  WHERE t2s.session_id = ? AND t2s.user_id = ?
  FOR UPDATE
`;

const SQL_UPDATE_UNANSWERED = `
  UPDATE tasks2session
  SET status = ?
  WHERE session_id = ? AND user_id = ? AND status = ?
`;

const SQL_UPDATE_SESSION = `
  UPDATE task_sessions
  SET right_number = ?, tasks_number = ?, session_status = ?, time = ?, start_time = ?
  WHERE id = ?
`;

const SQL_UPDATE_TEST_POINTS = `
  UPDATE task_sessions
  SET test_points = ?, test_points_max = ?
  WHERE id = ?
`;

const SQL_NMT_SCORE_ROWS = `
  SELECT
    COALESCE(t2s.first_attempt_status, t2s.status) AS status,
    t2s.awarded_points AS awarded_points,
    COALESCE(nqt.task_kind, 'mcq') AS task_kind,
    nqt.right_answer_text AS right_answer_text
  FROM tasks2session t2s
  INNER JOIN nmt_quiz_tasks nqt
    ON nqt.id = t2s.task_id AND t2s.task_type = ${TASK_TYPE_NMT}
  LEFT JOIN practice_task_origin po ON po.tasks2session_id = t2s.id
  WHERE t2s.session_id = ? AND t2s.user_id = ? AND po.tasks2session_id IS NULL
`;

export type FinishTrainerSessionInput = {
  userId: number;
  sessionId: number;
  /** Ultimate: treat unanswered mappings as incorrect before aggregating. */
  markUnansweredAsIncorrect?: boolean;
  /** Ultimate timeout: cap stored session time (seconds). */
  capTimeSec?: number;
};

export type FinishTrainerSessionResult = TrainerSessionSummary;

export type FinishTrainerSessionErrorCode =
  | "invalid_input"
  | "not_found"
  | "unfinished"
  | "session_expired"
  | "db_error";

export class FinishTrainerSessionError extends Error {
  constructor(
    message: string,
    public readonly code: FinishTrainerSessionErrorCode,
  ) {
    super(message);
    this.name = "FinishTrainerSessionError";
  }
}

type FinishTrainerSessionDeps = {
  getConnection: () => Promise<SqlConnection>;
  nowSec?: () => number;
};

type SessionRow = {
  id: number;
  user_id: number;
  theme_id: number | null;
  tasks_number: number;
  right_number: number;
  time: number;
  start_time: number;
  session_status: number;
  session_type?: number;
  expire_time: number;
  test_points?: number | null;
  test_points_max?: number | null;
  theme_code: string;
  theme_name: string;
};

type StatusRow = {
  follow_up_id?: number | null;
  status: number;
};

type NmtScoreRow = {
  status: number;
  awarded_points: number | null;
  task_kind: NmtScoreKind;
  right_answer_text: string | null;
};

function asScoreNumber(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function summaryWithScore(
  row: Parameters<typeof toTrainerSessionSummary>[0],
  score: { testPoints: number; maxTestPoints: number } | null,
) {
  const summary = toTrainerSessionSummary(row);
  if (!score || score.maxTestPoints <= 0) return summary;
  return {
    ...summary,
    percent: sessionPercent(score.maxTestPoints, score.testPoints) ?? summary.percent,
    testPoints: score.testPoints,
    maxTestPoints: score.maxTestPoints,
    scaleScore: nmtMathScaleScore(score.testPoints, score.maxTestPoints),
  };
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function validateFinishTrainerSessionInput(
  input: unknown,
): FinishTrainerSessionInput {
  if (typeof input !== "object" || input === null) {
    throw new FinishTrainerSessionError(
      "Request payload must be an object.",
      "invalid_input",
    );
  }
  const { userId, sessionId } = input as Record<string, unknown>;
  if (!isPositiveInt(userId) || !isPositiveInt(sessionId)) {
    throw new FinishTrainerSessionError(
      "userId and sessionId must be positive integers.",
      "invalid_input",
    );
  }
  return { userId, sessionId };
}

export function toTrainerSessionSummary(
  row: Pick<
    SessionRow,
    "id" | "theme_id" | "theme_code" | "theme_name" | "tasks_number" | "right_number" | "time"
  >,
): TrainerSessionSummary {
  const code = row.theme_code?.trim() ?? "";
  return {
    sessionId: row.id,
    rightNumber: row.right_number,
    tasksNumber: row.tasks_number,
    percent: sessionPercent(row.tasks_number, row.right_number) ?? 0,
    timeSec: row.time,
    themeId: row.theme_id ?? 0,
    themeCode: code || null,
    themeName: row.theme_name.trim(),
  };
}

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/**
 * Aggregates `tasks2session` answers into `task_sessions` (`right_number`,
 * `tasks_number`, `session_status = 1`, `time = now - start_time`).
 * Already-completed sessions return the stored summary without a second write.
 */
export async function finishTrainerSession(
  rawInput: unknown,
  deps: FinishTrainerSessionDeps = { getConnection: loadDefaultConnection },
): Promise<FinishTrainerSessionResult> {
  const input = validateFinishTrainerSessionInput(rawInput);
  const nowSec = deps.nowSec ?? nowUnixSec;

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
        throw new FinishTrainerSessionError(
          "Session was not found for this user.",
          "not_found",
        );
      }

      if (session.session_status === SESSION_STATUS_COMPLETED) {
        await connection.commit();
        const storedPoints = asScoreNumber(session.test_points);
        const storedMax = asScoreNumber(session.test_points_max);
        return summaryWithScore(
          session,
          storedPoints != null && storedMax != null
            ? { testPoints: storedPoints, maxTestPoints: storedMax }
            : null,
        );
      }

      if (isSessionExpired(session.expire_time, nowSec())) {
        await connection.rollback();
        throw new FinishTrainerSessionError(
          "This session's 24h lifetime has expired.",
          "session_expired",
        );
      }

      const mappings = await connection.query<StatusRow>(SQL_SELECT_STATUSES, [
        input.sessionId,
        input.userId,
      ]);

      if (mappings.length === 0) {
        await connection.rollback();
        throw new FinishTrainerSessionError(
          "Session was not found for this user.",
          "not_found",
        );
      }

      if (input.markUnansweredAsIncorrect) {
        await connection.execute(SQL_UPDATE_UNANSWERED, [
          TASK_STATUS_INCORRECT,
          input.sessionId,
          input.userId,
          TASK_STATUS_UNANSWERED,
        ]);
      }

      const refreshedMappings = input.markUnansweredAsIncorrect
        ? await connection.query<StatusRow>(SQL_SELECT_STATUSES, [
            input.sessionId,
            input.userId,
          ])
        : mappings;

      if (refreshedMappings.some((row) => row.status === TASK_STATUS_UNANSWERED)) {
        await connection.rollback();
        throw new FinishTrainerSessionError(
          "Every task must be answered before finishing.",
          "unfinished",
        );
      }

      const primaryMappings = refreshedMappings.filter((row) => row.follow_up_id == null);
      const tasksNumber = primaryMappings.length;
      const rightNumber = primaryMappings.filter(
        (row) => row.status === TASK_STATUS_CORRECT,
      ).length;
      const elapsed = resolveSessionElapsedSec(session.start_time, nowSec());
      const timeSec =
        input.capTimeSec !== undefined
          ? Math.min(elapsed.timeSec, input.capTimeSec)
          : elapsed.timeSec;

      const updated = await connection.execute(SQL_UPDATE_SESSION, [
        rightNumber,
        tasksNumber,
        SESSION_STATUS_COMPLETED,
        timeSec,
        elapsed.startTime,
        session.id,
      ]);
      if (updated.affectedRows !== 1) {
        await connection.rollback();
        throw new FinishTrainerSessionError(
          "Failed to store the session summary.",
          "db_error",
        );
      }

      let nmtScore: { testPoints: number; maxTestPoints: number } | null = null;
      if (session.session_type === 4) {
        const scoreRows = await connection.query<NmtScoreRow>(SQL_NMT_SCORE_ROWS, [
          input.sessionId,
          input.userId,
        ]);
        if (scoreRows.length > 0) {
          const paper = scoreNmtPaper(
            scoreRows.map((row) => ({
              kind: row.task_kind,
              correct: row.status === TASK_STATUS_CORRECT,
              awardedPoints: asScoreNumber(row.awarded_points),
              keyText: row.right_answer_text,
            })),
          );
          nmtScore = {
            testPoints: paper.testPoints,
            maxTestPoints: paper.maxTestPoints,
          };
          const pointsUpdate = await connection.execute(SQL_UPDATE_TEST_POINTS, [
            nmtScore.testPoints,
            nmtScore.maxTestPoints,
            session.id,
          ]);
          if (pointsUpdate.affectedRows !== 1) {
            await connection.rollback();
            throw new FinishTrainerSessionError(
              "Failed to store the session summary.",
              "db_error",
            );
          }
        }
      }

      await connection.commit();
      return summaryWithScore(
        {
          ...session,
          right_number: rightNumber,
          tasks_number: tasksNumber,
          time: timeSec,
        },
        nmtScore,
      );
    } catch (error) {
      if (!(error instanceof FinishTrainerSessionError)) {
        await connection.rollback().catch(() => undefined);
      }
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof FinishTrainerSessionError) {
      throw error;
    }
    console.error("finishTrainerSession: unexpected database error", error);
    throw new FinishTrainerSessionError(
      "Database operation failed.",
      "db_error",
    );
  }
}
