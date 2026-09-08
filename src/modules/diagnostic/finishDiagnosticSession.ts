import type { SqlConnection } from "@/lib/db/mysql";
import { SESSION_STATUS_COMPLETED, sessionPercent } from "@/modules/sessions/types";
import { nowUnixSec, resolveSessionElapsedSec } from "@/modules/testing/sessionElapsed";
import {
  TASK_STATUS_CORRECT,
  TASK_STATUS_INCORRECT,
  TASK_STATUS_UNANSWERED,
  type TrainerSessionSummary,
} from "@/modules/testing/types";
import { isValidOwner, ownerClause, ownerParams, type SessionOwner } from "./sessionOwner";

const SESSION_TYPE_DIAGNOSTIC = 5;

/** Sentinel theme fields for a diagnostic attempt (spans many themes, so no
 * single theme applies) — keeps the shared `TrainerSessionSummary` type and
 * every existing consumer (TopicTrainerSummary, `/sessions`) untouched. */
export const DIAGNOSTIC_SUMMARY_THEME_ID = 0;
export const DIAGNOSTIC_SUMMARY_THEME_NAME = "Загальна діагностика";

const SQL_SELECT_SESSION = `
  SELECT
    ts.id,
    ts.tasks_number,
    ts.right_number,
    ts.time,
    ts.start_time,
    ts.session_status
  FROM task_sessions ts
  WHERE ts.id = ? AND ts.session_type = ${SESSION_TYPE_DIAGNOSTIC}
    AND ${ownerClause("ts")}
  FOR UPDATE
`;

const SQL_SELECT_STATUSES = `
  SELECT status
  FROM tasks2session
  WHERE session_id = ? AND ${ownerClause("tasks2session")}
  FOR UPDATE
`;

const SQL_UPDATE_SESSION = `
  UPDATE task_sessions
  SET right_number = ?, tasks_number = ?, session_status = ?, time = ?, start_time = ?
  WHERE id = ?
`;

export type FinishDiagnosticSessionInput = {
  owner: SessionOwner;
  sessionId: number;
};

export type FinishDiagnosticSessionErrorCode =
  | "invalid_input"
  | "not_found"
  | "unfinished"
  | "db_error";

export class FinishDiagnosticSessionError extends Error {
  constructor(
    message: string,
    public readonly code: FinishDiagnosticSessionErrorCode,
  ) {
    super(message);
    this.name = "FinishDiagnosticSessionError";
  }
}

type FinishDiagnosticSessionDeps = {
  getConnection: () => Promise<SqlConnection>;
  nowSec?: () => number;
};

type SessionRow = {
  id: number;
  tasks_number: number;
  right_number: number;
  time: number;
  start_time: number;
  session_status: number;
};

type StatusRow = { status: number };

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function validateFinishDiagnosticSessionInput(
  input: unknown,
): FinishDiagnosticSessionInput {
  if (typeof input !== "object" || input === null) {
    throw new FinishDiagnosticSessionError(
      "Request payload must be an object.",
      "invalid_input",
    );
  }
  const { owner, sessionId } = input as Record<string, unknown>;
  if (!isValidOwner(owner) || !isPositiveInt(sessionId)) {
    throw new FinishDiagnosticSessionError(
      "owner must be valid and sessionId must be a positive integer.",
      "invalid_input",
    );
  }
  return { owner: owner as SessionOwner, sessionId };
}

export function toDiagnosticSummary(
  row: Pick<SessionRow, "id" | "tasks_number" | "right_number" | "time">,
): TrainerSessionSummary {
  return {
    sessionId: row.id,
    rightNumber: row.right_number,
    tasksNumber: row.tasks_number,
    percent: sessionPercent(row.tasks_number, row.right_number) ?? 0,
    timeSec: row.time,
    themeId: DIAGNOSTIC_SUMMARY_THEME_ID,
    themeCode: null,
    themeName: DIAGNOSTIC_SUMMARY_THEME_NAME,
  };
}

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/**
 * Owner-aware analog of `src/modules/testing/finishTrainerSession.ts`,
 * restricted to diagnostic (session_type=5) sessions. No recommendations —
 * diagnostic attempts don't feed the topic-recommendation engine.
 */
export async function finishDiagnosticSession(
  rawInput: unknown,
  deps: FinishDiagnosticSessionDeps = { getConnection: loadDefaultConnection },
): Promise<TrainerSessionSummary> {
  const input = validateFinishDiagnosticSessionInput(rawInput);
  const nowSec = deps.nowSec ?? nowUnixSec;
  const owner = ownerParams(input.owner);

  try {
    const connection = await deps.getConnection();
    try {
      await connection.beginTransaction();

      const sessions = await connection.query<SessionRow>(SQL_SELECT_SESSION, [
        input.sessionId,
        ...owner,
      ]);
      const session = sessions[0];

      if (!session) {
        await connection.rollback();
        throw new FinishDiagnosticSessionError(
          "Session was not found for this owner.",
          "not_found",
        );
      }

      if (session.session_status === SESSION_STATUS_COMPLETED) {
        await connection.commit();
        return toDiagnosticSummary(session);
      }

      const mappings = await connection.query<StatusRow>(SQL_SELECT_STATUSES, [
        input.sessionId,
        ...owner,
      ]);

      if (mappings.length === 0) {
        await connection.rollback();
        throw new FinishDiagnosticSessionError(
          "Session was not found for this owner.",
          "not_found",
        );
      }

      if (mappings.some((row) => row.status === TASK_STATUS_UNANSWERED)) {
        await connection.rollback();
        throw new FinishDiagnosticSessionError(
          "Every task must be answered before finishing.",
          "unfinished",
        );
      }

      const tasksNumber = mappings.length;
      const rightNumber = mappings.filter(
        (row) => row.status === TASK_STATUS_CORRECT,
      ).length;
      const elapsed = resolveSessionElapsedSec(session.start_time, nowSec());

      const updated = await connection.execute(SQL_UPDATE_SESSION, [
        rightNumber,
        tasksNumber,
        SESSION_STATUS_COMPLETED,
        elapsed.timeSec,
        elapsed.startTime,
        session.id,
      ]);
      if (updated.affectedRows !== 1) {
        await connection.rollback();
        throw new FinishDiagnosticSessionError(
          "Failed to store the session summary.",
          "db_error",
        );
      }

      await connection.commit();
      return toDiagnosticSummary({
        ...session,
        right_number: rightNumber,
        tasks_number: tasksNumber,
        time: elapsed.timeSec,
      });
    } catch (error) {
      if (!(error instanceof FinishDiagnosticSessionError)) {
        await connection.rollback().catch(() => undefined);
      }
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof FinishDiagnosticSessionError) {
      throw error;
    }
    console.error("finishDiagnosticSession: unexpected database error", error);
    throw new FinishDiagnosticSessionError(
      "Database operation failed.",
      "db_error",
    );
  }
}

// Re-exported for callers that need the status constants without an extra
// import from `@/modules/testing/types`.
export { TASK_STATUS_CORRECT, TASK_STATUS_INCORRECT, TASK_STATUS_UNANSWERED };
