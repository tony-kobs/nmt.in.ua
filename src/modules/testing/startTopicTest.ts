import type { SqlConnection } from "@/lib/db/mysql";
import { ensureSelfScoreSchema } from "@/modules/self-score/schema";
import { isValidSelfScore } from "@/modules/self-score/types";
import {
  parseTopicTestMode,
  taskLimitForMode,
  TOPIC_TEST_TASK_COUNT,
  type TopicTestMode,
} from "./topicTestMode";

export { TOPIC_TEST_TASK_COUNT };

/** Verified `task_sessions` conventions for a topic test. */
const SESSION_TYPE_TOPIC = 1;
const SESSION_STATUS_CREATED = 2;
const SESSION_START_TIME = 0;
const SESSION_INITIAL_RIGHT_NUMBER = 0;
const SESSION_INITIAL_TIME = 0;

/** Verified `tasks2session` conventions for a freshly created mapping row. */
const TASK_TYPE_TOPIC = 1;
const TASK_STATUS_UNANSWERED = 0;

/**
 * Table and column names below match the schema verified directly against
 * the team's MySQL database.
 */
function buildSelectTasksSql(limit: number): string {
  return `SELECT id FROM quiz_tasks WHERE theme_id = ? ORDER BY RAND() LIMIT ${limit}`;
}

const SQL_INSERT_SESSION =
  "INSERT INTO task_sessions (user_id, session_type, theme_id, tasks_number, right_number, time, session_status, start_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
const SQL_INSERT_MAPPING_PREFIX =
  "INSERT INTO tasks2session (task_type, task_id, session_id, user_id, status) VALUES ";
const SQL_INSERT_SELF_SCORE = `
  INSERT INTO user_self_scores (user_id, guest_token, theme_id, score, source)
  VALUES (?, NULL, ?, ?, 'pre_topic')
`;

export type StartTopicTestInput = {
  userId: number;
  themeId: number;
  mode?: TopicTestMode;
  /** Required by TopicTestStart's pre-topic self-assessment step; written in
   * the same transaction as the session so a failed start never leaves an
   * orphan `user_self_scores` row (and vice versa). Omitted entirely by
   * every other caller (e.g. planned/auto sessions). */
  selfScore?: number;
};

export type StartTopicTestResult = {
  sessionId: number;
  themeId: number;
  taskIds: number[];
  mode: TopicTestMode;
};

export type StartTopicTestErrorCode =
  | "invalid_input"
  | "insufficient_tasks"
  | "already_in_progress"
  | "db_error";

export class StartTopicTestError extends Error {
  constructor(
    message: string,
    public readonly code: StartTopicTestErrorCode,
  ) {
    super(message);
    this.name = "StartTopicTestError";
  }
}

type StartTopicTestDeps = {
  getConnection: () => Promise<SqlConnection>;
};

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function validateStartTopicTestInput(
  input: unknown,
): StartTopicTestInput {
  if (typeof input !== "object" || input === null) {
    throw new StartTopicTestError(
      "Request payload must be an object.",
      "invalid_input",
    );
  }
  const { userId, themeId, mode, selfScore } = input as Record<string, unknown>;
  if (!isPositiveInt(userId) || !isPositiveInt(themeId)) {
    throw new StartTopicTestError(
      "userId and themeId must be positive integers.",
      "invalid_input",
    );
  }
  if (selfScore !== undefined && !isValidSelfScore(selfScore)) {
    throw new StartTopicTestError(
      "selfScore must be an integer 1-10.",
      "invalid_input",
    );
  }
  return {
    userId,
    themeId,
    mode: parseTopicTestMode(mode),
    selfScore: selfScore as number | undefined,
  };
}

/** Guards against duplicate concurrent start requests from the same user. */
const pendingUserIds = new Set<number>();

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/**
 * Starts a topic-test session: selects up to the mode limit of distinct tasks
 * for the theme (or all available when fewer), inserts one `task_sessions` row
 * and one `tasks2session` row per task, all inside a single transaction.
 */
export async function startTopicTest(
  rawInput: unknown,
  deps: StartTopicTestDeps = { getConnection: loadDefaultConnection },
): Promise<StartTopicTestResult> {
  const input = validateStartTopicTestInput(rawInput);
  const taskLimit = taskLimitForMode(input.mode ?? "standard");

  if (pendingUserIds.has(input.userId)) {
    throw new StartTopicTestError(
      "A test-start request is already in progress for this user.",
      "already_in_progress",
    );
  }
  pendingUserIds.add(input.userId);

  try {
    if (input.selfScore !== undefined) {
      await ensureSelfScoreSchema(deps.getConnection);
    }

    const connection = await deps.getConnection();
    try {
      await connection.beginTransaction();

      const tasks = await connection.query<{ id: number }>(
        buildSelectTasksSql(taskLimit),
        [input.themeId],
      );

      const taskCount = tasks.length;
      if (taskCount === 0) {
        await connection.rollback();
        throw new StartTopicTestError(
          "No tasks available for the selected theme.",
          "insufficient_tasks",
        );
      }

      const session = await connection.execute(SQL_INSERT_SESSION, [
        input.userId,
        SESSION_TYPE_TOPIC,
        input.themeId,
        taskCount,
        SESSION_INITIAL_RIGHT_NUMBER,
        SESSION_INITIAL_TIME,
        SESSION_STATUS_CREATED,
        SESSION_START_TIME,
      ]);

      const placeholders = tasks.map(() => "(?, ?, ?, ?, ?)").join(", ");
      const mappingParams = tasks.flatMap((task) => [
        TASK_TYPE_TOPIC,
        task.id,
        session.insertId,
        input.userId,
        TASK_STATUS_UNANSWERED,
      ]);
      const mapping = await connection.execute(
        SQL_INSERT_MAPPING_PREFIX + placeholders,
        mappingParams,
      );

      if (mapping.affectedRows !== taskCount) {
        await connection.rollback();
        throw new StartTopicTestError(
          "Failed to link all tasks to the new session.",
          "db_error",
        );
      }

      if (input.selfScore !== undefined) {
        const selfScoreInsert = await connection.execute(
          SQL_INSERT_SELF_SCORE,
          [input.userId, input.themeId, input.selfScore],
        );
        if (selfScoreInsert.affectedRows !== 1) {
          await connection.rollback();
          throw new StartTopicTestError(
            "Failed to store the pre-topic self-score.",
            "db_error",
          );
        }
      }

      await connection.commit();

      return {
        sessionId: session.insertId,
        themeId: input.themeId,
        taskIds: tasks.map((task) => task.id),
        mode: input.mode ?? "standard",
      };
    } catch (error) {
      if (!(error instanceof StartTopicTestError)) {
        await connection.rollback().catch(() => undefined);
      }
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof StartTopicTestError) {
      throw error;
    }
    console.error("startTopicTest: unexpected database error", error);
    throw new StartTopicTestError("Database operation failed.", "db_error");
  } finally {
    pendingUserIds.delete(input.userId);
  }
}
