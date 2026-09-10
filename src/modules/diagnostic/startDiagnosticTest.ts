import type { SqlConnection } from "@/lib/db/mysql";
import { sampleRandomIds } from "@/lib/sampleRandomIds";
import { ensureSelfScoreSchema } from "@/modules/self-score/schema";
import { isValidSelfScore } from "@/modules/self-score/types";
import { isValidOwner, ownerKey, type SessionOwner } from "./sessionOwner";

/** `task_sessions.session_type` for a diagnostic attempt (1 user/2 auto/3
 * mentor/4 NMT are the pre-existing values; 5 is new). */
const SESSION_TYPE_DIAGNOSTIC = 5;
const SESSION_STATUS_CREATED = 2;
const SESSION_START_TIME = 0;
const SESSION_INITIAL_RIGHT_NUMBER = 0;
const SESSION_INITIAL_TIME = 0;
const TASK_TYPE_TOPIC = 1;
const TASK_STATUS_UNANSWERED = 0;

/** A diagnostic attempt samples this many tasks from every eligible theme,
 * capped at this many themes (curriculum order — see docs for the
 * unresolved mentor decision on the >10-eligible-themes policy). */
export const DIAGNOSTIC_TASKS_PER_THEME = 3;
export const DIAGNOSTIC_MAX_THEMES = 10;

/** Exported so `hasEligibleDiagnosticContent` checks the exact same eligibility
 * definition a real attempt would use, instead of re-deriving it and risking drift. */
export const SQL_ELIGIBLE_THEMES = `
  SELECT t.id AS theme_id
  FROM themes t
  INNER JOIN quiz_tasks q ON q.theme_id = t.id
  GROUP BY t.id, t.ord
  HAVING COUNT(q.id) >= ${DIAGNOSTIC_TASKS_PER_THEME}
  ORDER BY t.ord ASC, t.id ASC
  LIMIT ${DIAGNOSTIC_MAX_THEMES}
`;

const SQL_SELECT_TASK_IDS_FOR_THEMES = `
  SELECT id, theme_id
  FROM quiz_tasks
  WHERE theme_id IN
`;

const SQL_INSERT_SELF_SCORE = `
  INSERT INTO user_self_scores (user_id, guest_token, theme_id, score, source)
  VALUES (?, ?, NULL, ?, 'diagnostic_overall')
`;

const SQL_INSERT_SESSION = `
  INSERT INTO task_sessions
    (user_id, guest_token, session_type, theme_id, tasks_number, right_number, time, session_status, start_time)
  VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)
`;

const SQL_INSERT_MAPPING_PREFIX =
  "INSERT INTO tasks2session (task_type, task_id, session_id, user_id, guest_token, status) VALUES ";

export type StartDiagnosticTestInput = {
  owner: SessionOwner;
  selfScore: number;
};

export type StartDiagnosticTestResult = {
  sessionId: number;
  themeIds: number[];
  taskIds: number[];
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
  const { owner, selfScore } = input as Record<string, unknown>;
  if (!isValidOwner(owner)) {
    throw new StartDiagnosticTestError(
      "owner must be exactly one of userId or guestToken.",
      "invalid_input",
    );
  }
  if (!isValidSelfScore(selfScore)) {
    throw new StartDiagnosticTestError(
      "selfScore must be an integer 1-10.",
      "invalid_input",
    );
  }
  return { owner: owner as SessionOwner, selfScore };
}

/** Guards against duplicate concurrent diagnostic starts from the same owner. */
const pendingOwnerKeys = new Set<string>();

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/**
 * Starts a diagnostic test: records the general self-assessment, then
 * selects up to DIAGNOSTIC_TASKS_PER_THEME tasks from every theme that has
 * at least that many (capped at DIAGNOSTIC_MAX_THEMES themes, curriculum
 * order), and creates one `task_sessions` row (session_type=5, theme_id
 * NULL — a diagnostic attempt spans many themes) with matching
 * `tasks2session` rows. All inside a single transaction so a failed start
 * never leaves an orphaned self-score row.
 */
export async function startDiagnosticTest(
  rawInput: unknown,
  deps: StartDiagnosticTestDeps = { getConnection: loadDefaultConnection },
): Promise<StartDiagnosticTestResult> {
  const input = validateStartDiagnosticTestInput(rawInput);
  const key = ownerKey(input.owner);

  if (pendingOwnerKeys.has(key)) {
    throw new StartDiagnosticTestError(
      "A diagnostic-start request is already in progress for this owner.",
      "already_in_progress",
    );
  }
  pendingOwnerKeys.add(key);

  try {
    await ensureSelfScoreSchema(deps.getConnection);

    const connection = await deps.getConnection();
    try {
      await connection.beginTransaction();

      const themeRows = await connection.query<{ theme_id: number }>(
        SQL_ELIGIBLE_THEMES,
      );
      const themeIds = themeRows.map((row) => row.theme_id);

      if (themeIds.length === 0) {
        await connection.rollback();
        throw new StartDiagnosticTestError(
          "No eligible themes are available for a diagnostic test.",
          "insufficient_tasks",
        );
      }

      await connection.execute(SQL_INSERT_SELF_SCORE, [
        input.owner.userId,
        input.owner.guestToken,
        input.selfScore,
      ]);

      const placeholders = themeIds.map(() => "?").join(", ");
      const pool = await connection.query<{ id: number; theme_id: number }>(
        `${SQL_SELECT_TASK_IDS_FOR_THEMES} (${placeholders})`,
        themeIds,
      );

      const idsByTheme = new Map<number, number[]>();
      for (const row of pool) {
        const list = idsByTheme.get(row.theme_id) ?? [];
        list.push(row.id);
        idsByTheme.set(row.theme_id, list);
      }

      const taskIds: number[] = [];
      for (const themeId of themeIds) {
        const sampled = sampleRandomIds(
          idsByTheme.get(themeId) ?? [],
          DIAGNOSTIC_TASKS_PER_THEME,
        );
        for (const id of sampled) taskIds.push(id);
      }

      if (taskIds.length === 0) {
        await connection.rollback();
        throw new StartDiagnosticTestError(
          "No tasks available for any eligible theme.",
          "insufficient_tasks",
        );
      }

      const session = await connection.execute(SQL_INSERT_SESSION, [
        input.owner.userId,
        input.owner.guestToken,
        SESSION_TYPE_DIAGNOSTIC,
        taskIds.length,
        SESSION_INITIAL_RIGHT_NUMBER,
        SESSION_INITIAL_TIME,
        SESSION_STATUS_CREATED,
        SESSION_START_TIME,
      ]);

      const mappingPlaceholders = taskIds
        .map(() => "(?, ?, ?, ?, ?, ?)")
        .join(", ");
      const mappingParams = taskIds.flatMap((taskId) => [
        TASK_TYPE_TOPIC,
        taskId,
        session.insertId,
        input.owner.userId,
        input.owner.guestToken,
        TASK_STATUS_UNANSWERED,
      ]);
      const mapping = await connection.execute(
        SQL_INSERT_MAPPING_PREFIX + mappingPlaceholders,
        mappingParams,
      );

      if (mapping.affectedRows !== taskIds.length) {
        await connection.rollback();
        throw new StartDiagnosticTestError(
          "Failed to link all tasks to the new diagnostic session.",
          "db_error",
        );
      }

      await connection.commit();

      return {
        sessionId: session.insertId,
        themeIds,
        taskIds,
      };
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
