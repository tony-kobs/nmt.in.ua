import type { SqlConnection } from "@/lib/db/mysql";
import { publishedQuizTaskSql } from "@/lib/publishedQuizTask";
import { SESSION_STATUS_COMPLETED } from "@/modules/sessions/types";
import { isSessionExpired } from "@/modules/testing/sessionExpiry";
import { TASK_STATUS_UNANSWERED } from "@/modules/testing/types";
import {
  selectDiagnosticTask,
  type DifficultyCandidate,
} from "./adaptiveDifficulty";
import {
  resolveDiagnosticNextStep,
  type DiagnosticNextStep,
  type DiagnosticProgressMapping,
} from "./diagnosticProgress";
import { ownerClause, ownerParams, type SessionOwner } from "./sessionOwner";

const SESSION_TYPE_DIAGNOSTIC = 5;
const TASK_TYPE_TOPIC = 1;

const SQL_LOCK_SESSION = `
  SELECT id, session_status, expire_time
  FROM task_sessions
  WHERE id = ? AND session_type = ${SESSION_TYPE_DIAGNOSTIC}
    AND ${ownerClause("task_sessions")}
  FOR UPDATE
`;

const SQL_PROGRESS_MAPPINGS = `
  SELECT t2s.task_id, qt.theme_id, qt.difficulty, t2s.status
  FROM tasks2session t2s
  INNER JOIN quiz_tasks qt ON qt.id = t2s.task_id
  WHERE t2s.session_id = ? AND ${ownerClause("t2s")}
  ORDER BY t2s.id ASC
`;

/** Published bank — theme filter happens in `selectDiagnosticTask`. */
const SQL_BANK_CANDIDATES = `
  SELECT id, theme_id AS themeId, difficulty
  FROM quiz_tasks
  WHERE ${publishedQuizTaskSql()}
`;

const SQL_INSERT_MAPPING = `
  INSERT INTO tasks2session (task_type, task_id, session_id, user_id, guest_token, status)
  VALUES (${TASK_TYPE_TOPIC}, ?, ?, ?, ?, ${TASK_STATUS_UNANSWERED})
`;

type LockedSessionRow = {
  id: number;
  session_status: number;
  expire_time: number;
};

type ProgressMappingRow = {
  task_id: number;
  theme_id: number;
  difficulty: number;
  status: number;
};

export type LockedSessionState = "active" | "completed" | "expired";

export async function lockDiagnosticSession(
  connection: SqlConnection,
  sessionId: number,
  owner: SessionOwner,
  nowSec: number,
): Promise<LockedSessionState | null> {
  const rows = await connection.query<LockedSessionRow>(SQL_LOCK_SESSION, [
    sessionId,
    ...ownerParams(owner),
  ]);
  const row = rows[0];
  if (!row) return null;
  if (row.session_status === SESSION_STATUS_COMPLETED) return "completed";
  if (isSessionExpired(row.expire_time, nowSec)) return "expired";
  return "active";
}

export async function loadProgressMappings(
  connection: SqlConnection,
  sessionId: number,
  owner: SessionOwner,
  options: { forUpdate: boolean },
): Promise<DiagnosticProgressMapping[]> {
  const rows = await connection.query<ProgressMappingRow>(
    options.forUpdate ? `${SQL_PROGRESS_MAPPINGS} FOR UPDATE` : SQL_PROGRESS_MAPPINGS,
    [sessionId, ...ownerParams(owner)],
  );
  return rows.map((row) => ({
    taskId: row.task_id,
    themeId: row.theme_id,
    difficulty: row.difficulty,
    status: row.status,
  }));
}

export async function loadBankCandidates(
  connection: SqlConnection,
): Promise<DifficultyCandidate[]> {
  return connection.query<DifficultyCandidate>(SQL_BANK_CANDIDATES);
}

export type ResolvedDiagnosticStep = {
  step: DiagnosticNextStep;
  nextTaskId: number | null;
};

/**
 * Resolve the pure next step against the live task bank. When no unused
 * task with a different theme exists, the attempt completes early.
 */
export async function resolveStepAgainstBank(
  connection: SqlConnection,
  mappings: readonly DiagnosticProgressMapping[],
): Promise<ResolvedDiagnosticStep> {
  const step = resolveDiagnosticNextStep({ mappings });
  if (step.kind !== "nextTask") {
    return { step, nextTaskId: null };
  }

  const candidates = await loadBankCandidates(connection);
  const taskId = selectDiagnosticTask(
    candidates,
    mappings.map((mapping) => mapping.taskId),
    {
      targetDifficulty: step.targetDifficulty,
      fallbackDifficulty: step.fallbackDifficulty,
      excludeThemeId: step.excludeThemeId,
    },
  );

  if (taskId === null) {
    return { step: { kind: "complete" }, nextTaskId: null };
  }
  return { step, nextTaskId: taskId };
}

export async function insertDiagnosticMapping(
  connection: SqlConnection,
  sessionId: number,
  owner: SessionOwner,
  taskId: number,
): Promise<number | null> {
  const result = await connection.execute(SQL_INSERT_MAPPING, [
    taskId,
    sessionId,
    owner.userId,
    owner.guestToken,
  ]);
  return result.affectedRows === 1 ? result.insertId : null;
}
