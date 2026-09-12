import type { SqlConnection } from "@/lib/db/mysql";
import { sampleRandomIds } from "@/lib/sampleRandomIds";
import { ensureSelfScoreSchema } from "@/modules/self-score/schema";
import { isValidSelfScore } from "@/modules/self-score/types";
import { nowUnixSec } from "./sessionElapsed";
import { computeSessionDeadline } from "./sessionExpiry";
import {
  parseRequestedTaskCount,
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

/** Indexed id list for the theme — sample in Node instead of `ORDER BY RAND()`. */
const SQL_SELECT_TASK_IDS = `SELECT id FROM quiz_tasks WHERE theme_id = ?`;

const SQL_INSERT_SESSION =
  "INSERT INTO task_sessions (user_id, session_type, theme_id, tasks_number, right_number, time, session_status, start_time, expire_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
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
  /** How many tasks to draw. Caps at the bank size. When omitted, falls
   * back to the mode default (10 standard / 20 ultimate). */
  taskCount?: number;
  /** Optional pre-topic self-assessment. Written in the same transaction as
   * the session. TopicTestStart no longer sends this; diagnostic and other
   * callers may still pass it. */
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
  nowSec?: () => number;
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
  const { userId, themeId, mode, selfScore, taskCount } = input as Record<
    string,
    unknown
  >;
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
  let parsedTaskCount: number | undefined;
  if (taskCount !== undefined) {
    const parsed = parseRequestedTaskCount(taskCount);
    if (parsed === null) {
      throw new StartTopicTestError(
        "taskCount must be an integer from 1 to MAX_TOPIC_TEST_TASKS.",
        "invalid_input",
      );
    }
    parsedTaskCount = parsed;
  }
  return {
    userId,
    themeId,
    mode: parseTopicTestMode(mode),
    taskCount: parsedTaskCount,
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
 * Starts a topic-test session: selects up to `taskCount` (or the mode default)
 * distinct tasks for the theme (or all available when fewer), inserts one
 * `task_sessions` row and one `tasks2session` row per task, all inside a
 * single transaction.
 */
export async function startTopicTest(
  rawInput: unknown,
  deps: StartTopicTestDeps = { getConnection: loadDefaultConnection },
): Promise<StartTopicTestResult> {
  const input = validateStartTopicTestInput(rawInput);
  const taskLimit =
    input.taskCount ?? taskLimitForMode(input.mode ?? "standard");
  const nowSec = deps.nowSec ?? nowUnixSec;

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

      const pool = await connection.query<{ id: number }>(SQL_SELECT_TASK_IDS, [
        input.themeId,
      ]);
      const taskIds = sampleRandomIds(
        pool.map((row) => row.id),
        taskLimit,
      );

      const taskCount = taskIds.length;
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
        computeSessionDeadline(nowSec()),
      ]);

      const placeholders = taskIds.map(() => "(?, ?, ?, ?, ?)").join(", ");
      const mappingParams = taskIds.flatMap((taskId) => [
        TASK_TYPE_TOPIC,
        taskId,
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
        taskIds,
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
