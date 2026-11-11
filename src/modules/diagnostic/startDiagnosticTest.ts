import type { SqlConnection } from "@/lib/db/mysql";
import { publishedQuizTaskSql } from "@/lib/publishedQuizTask";
import { nowUnixSec } from "@/modules/testing/sessionElapsed";
import { computeSessionDeadline } from "@/modules/testing/sessionExpiry";
import {
  insertDiagnosticMapping,
  resolveStepAgainstBank,
} from "./diagnosticFlowStore";
import { DIAGNOSTIC_TOTAL_QUESTIONS } from "./diagnosticProgress";
import { isValidOwner, ownerKey, type SessionOwner } from "./sessionOwner";

const SESSION_TYPE_DIAGNOSTIC = 5;
const SESSION_STATUS_CREATED = 2;
const SESSION_START_TIME = 0;
const SESSION_INITIAL_RIGHT_NUMBER = 0;
const SESSION_INITIAL_TIME = 0;

/** At least this many themes so consecutive questions can alternate. */
export const DIAGNOSTIC_MIN_THEMES = 2;

/** Bank must have at least one full attempt's worth of tasks. */
export const SQL_BANK_ELIGIBILITY = `
  SELECT
    COUNT(*) AS task_count,
    COUNT(DISTINCT theme_id) AS theme_count
  FROM quiz_tasks
  WHERE ${publishedQuizTaskSql()}
`;

const SQL_INSERT_SESSION = `
  INSERT INTO task_sessions
    (user_id, guest_token, session_type, theme_id, tasks_number, right_number, time, session_status, start_time, expire_time)
  VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
`;

export type StartDiagnosticTestInput = {
  owner: SessionOwner;
};

export type StartDiagnosticTestResult = {
  sessionId: number;
};

export type StartDiagnosticTestErrorCode =
  | "invalid_input"
  | "insufficient_tasks"
  | "already_in_progress"
  | "db_error";

export class StartDiagnosticTestError extends Error {
  constructor(
    message: string,
    public readonly code: StartDiagnosticTestErrorCode,
  ) {
    super(message);
    this.name = "StartDiagnosticTestError";
  }
}

type StartDiagnosticTestDeps = {
  getConnection: () => Promise<SqlConnection>;
  nowSec?: () => number;
};

type BankEligibilityRow = {
  task_count: number | string;
  theme_count: number | string;
};

export function validateStartDiagnosticTestInput(
  input: unknown,
): StartDiagnosticTestInput {
  if (typeof input !== "object" || input === null) {
    throw new StartDiagnosticTestError(
      "Request payload must be an object.",
      "invalid_input",
    );
  }
  const { owner } = input as Record<string, unknown>;
  if (!isValidOwner(owner)) {
    throw new StartDiagnosticTestError(
      "owner must be exactly one of userId or guestToken.",
      "invalid_input",
    );
  }
  return { owner: owner as SessionOwner };
}

const pendingOwnerKeys = new Set<string>();

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

export function isDiagnosticBankEligible(row: {
  task_count: number | string;
  theme_count: number | string;
}): boolean {
  return (
    Number(row.task_count) >= DIAGNOSTIC_TOTAL_QUESTIONS &&
    Number(row.theme_count) >= DIAGNOSTIC_MIN_THEMES
  );
}

/**
 * Starts the adaptive intro test: creates a diagnostic session and links
 * the first difficulty-1 task immediately. Further tasks are linked by
 * `advanceDiagnosticSession` after each answer.
 */
export async function startDiagnosticTest(
  rawInput: unknown,
  deps: StartDiagnosticTestDeps = { getConnection: loadDefaultConnection },
): Promise<StartDiagnosticTestResult> {
  const input = validateStartDiagnosticTestInput(rawInput);
  const key = ownerKey(input.owner);
  const nowSec = deps.nowSec ?? nowUnixSec;

  if (pendingOwnerKeys.has(key)) {
    throw new StartDiagnosticTestError(
      "A diagnostic-start request is already in progress for this owner.",
      "already_in_progress",
    );
  }
  pendingOwnerKeys.add(key);

  try {
    const connection = await deps.getConnection();
    try {
      await connection.beginTransaction();

      const eligibility = await connection.query<BankEligibilityRow>(
        SQL_BANK_ELIGIBILITY,
      );
      const bank = eligibility[0];
      if (!bank || !isDiagnosticBankEligible(bank)) {
        await connection.rollback();
        throw new StartDiagnosticTestError(
          "Not enough tasks or themes for a diagnostic test.",
          "insufficient_tasks",
        );
      }

      const session = await connection.execute(SQL_INSERT_SESSION, [
        input.owner.userId,
        input.owner.guestToken,
        SESSION_TYPE_DIAGNOSTIC,
        DIAGNOSTIC_TOTAL_QUESTIONS,
        SESSION_INITIAL_RIGHT_NUMBER,
        SESSION_INITIAL_TIME,
        SESSION_STATUS_CREATED,
        SESSION_START_TIME,
        computeSessionDeadline(nowSec()),
      ]);
      const sessionId = session.insertId;

      const { step, nextTaskId } = await resolveStepAgainstBank(connection, []);
      if (step.kind !== "nextTask" || nextTaskId === null) {
        await connection.rollback();
        throw new StartDiagnosticTestError(
          "Not enough tasks or themes for a diagnostic test.",
          "insufficient_tasks",
        );
      }

      const mappingId = await insertDiagnosticMapping(
        connection,
        sessionId,
        input.owner,
        nextTaskId,
      );
      if (mappingId === null) {
        throw new StartDiagnosticTestError(
          "Failed to link the first diagnostic task.",
          "db_error",
        );
      }

      await connection.commit();
      return { sessionId };
    } catch (error) {
      if (!(error instanceof StartDiagnosticTestError)) {
        await connection.rollback().catch(() => undefined);
      }
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof StartDiagnosticTestError) {
      throw error;
    }
    console.error("startDiagnosticTest: unexpected database error", error);
    throw new StartDiagnosticTestError(
      "Database operation failed.",
      "db_error",
    );
  } finally {
    pendingOwnerKeys.delete(key);
  }
}
