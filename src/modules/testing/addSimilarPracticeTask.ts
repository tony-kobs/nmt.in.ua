import type { SqlConnection } from "@/lib/db/mysql";
import { SESSION_STATUS_COMPLETED } from "@/modules/sessions/types";
import { resolvePreferredDifficulty } from "./practiceAdaptive";
import {
  selectFollowUpCandidate,
  type FollowUpCandidate,
} from "./pickPracticeFollowUpTask";
import { nowUnixSec } from "./sessionElapsed";
import { isSessionExpired } from "./sessionExpiry";
import { TASK_STATUS_INCORRECT, TASK_STATUS_UNANSWERED } from "./types";
import type { SessionTask } from "./types";

/** Verified `tasks2session.task_type` for the topic-test bank (`quiz_tasks`). */
const TASK_TYPE_TOPIC = 1;
/** Verified `task_sessions.session_type` values that are NOT eligible for
 * a Practice-mode similar task: 4 = NMT simulator (own bank/flow), 5 =
 * diagnostic (must never offer a corrective retry — see AGENTS.md).
 * User/auto/mentor topic tests (1/2/3) all share the same immediate-feedback
 * trainer UI and are the only types this feature applies to. */
const INELIGIBLE_SESSION_TYPES = [4, 5];

const SQL_SELECT_SOURCE = `
  SELECT
    t2s.task_id,
    t2s.status,
    t2s.task_type,
    ts.session_type,
    ts.session_status,
    ts.expire_time,
    qt.theme_id,
    qt.difficulty
  FROM tasks2session t2s
  INNER JOIN task_sessions ts ON ts.id = t2s.session_id
  INNER JOIN quiz_tasks qt ON qt.id = t2s.task_id
  WHERE t2s.id = ? AND t2s.session_id = ? AND t2s.user_id = ?
  FOR UPDATE
`;

const SQL_SELECT_USED_TASK_IDS = `
  SELECT task_id FROM tasks2session
  WHERE session_id = ? AND task_type = ${TASK_TYPE_TOPIC}
`;

const SQL_SELECT_CANDIDATES = `SELECT id, difficulty FROM quiz_tasks WHERE theme_id = ?`;

const SQL_INSERT_MAPPING =
  "INSERT INTO tasks2session (task_type, task_id, session_id, user_id, status) VALUES (?, ?, ?, ?, ?)";

const SQL_SELECT_NEW_TASK = `
  SELECT id, name, task_text, answer_1, answer_2, answer_3, answer_4
  FROM quiz_tasks WHERE id = ?
`;

export type AddSimilarPracticeTaskInput = {
  userId: number;
  sessionId: number;
  mappingId: number;
  /** Consecutive-correct streak going into the task that was just answered
   * incorrectly — lets adaptive difficulty still favor a harder follow-up
   * for a student who was otherwise on a strong run (see
   * `practiceAdaptive.ts`). */
  streak: number;
};

export type AddSimilarPracticeTaskResult = {
  mappingId: number;
  task: SessionTask;
};

export type AddSimilarPracticeTaskErrorCode =
  | "invalid_input"
  | "not_found"
  | "not_eligible"
  | "not_incorrect"
  | "no_similar_task"
  | "session_expired"
  | "db_error";

export class AddSimilarPracticeTaskError extends Error {
  constructor(
    message: string,
    public readonly code: AddSimilarPracticeTaskErrorCode,
  ) {
    super(message);
    this.name = "AddSimilarPracticeTaskError";
  }
}

type SourceRow = {
  task_id: number;
  status: number;
  task_type: number;
  session_type: number;
  session_status: number;
  expire_time: number;
  theme_id: number | null;
  difficulty: number;
};

type UsedIdRow = { task_id: number };

type NewTaskRow = {
  id: number;
  name: string;
  task_text: string;
  answer_1: string | null;
  answer_2: string | null;
  answer_3: string | null;
  answer_4: string | null;
};

type AddSimilarPracticeTaskDeps = {
  getConnection: () => Promise<SqlConnection>;
  nowSec?: () => number;
};

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function mapNewTask(row: NewTaskRow, mappingId: number): SessionTask {
  const answers = [row.answer_1, row.answer_2, row.answer_3, row.answer_4]
    .map((text, index) =>
      text != null && text.trim() !== ""
        ? { number: (index + 1) as 1 | 2 | 3 | 4, text: text.trim() }
        : null,
    )
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    mappingId,
    taskId: row.id,
    name: row.name.trim(),
    taskText: row.task_text.trim(),
    answers,
    status: TASK_STATUS_UNANSWERED,
  };
}

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/**
 * Practice mode's "Try a similar task": only reachable after an incorrect
 * answer on a topic-test task, and only for session types that already show
 * immediate right/wrong feedback (never diagnostic or NMT — see
 * `sessionMode.ts`). Adds one more `tasks2session` row to the *same*
 * session rather than starting a side quest — `finishTrainerSession`
 * already recomputes `tasksNumber`/`rightNumber` from the live row count
 * (see `finishTrainerSession.ts`), so the extra task folds into the normal
 * score without any schema change or new session concept.
 *
 * Task selection itself (same theme, excludes tasks already in the
 * session, prefers a harder pick per `resolvePreferredDifficulty`) lives in
 * `pickPracticeFollowUpTask.ts` — kept out of this transaction/orchestration
 * layer and out of the UI, per the "selection logic stays in the testing
 * domain layer" rule.
 */
export async function addSimilarPracticeTask(
  rawInput: AddSimilarPracticeTaskInput,
  deps: AddSimilarPracticeTaskDeps = { getConnection: loadDefaultConnection },
): Promise<AddSimilarPracticeTaskResult> {
  const { userId, sessionId, mappingId, streak } = rawInput;
  if (
    !isPositiveInt(userId) ||
    !isPositiveInt(sessionId) ||
    !isPositiveInt(mappingId) ||
    !Number.isInteger(streak) ||
    streak < 0
  ) {
    throw new AddSimilarPracticeTaskError(
      "userId, sessionId, mappingId must be positive integers and streak a non-negative integer.",
      "invalid_input",
    );
  }

  try {
    const connection = await deps.getConnection();
    try {
      await connection.beginTransaction();

      const sourceRows = await connection.query<SourceRow>(SQL_SELECT_SOURCE, [
        mappingId,
        sessionId,
        userId,
      ]);
      const source = sourceRows[0];
      if (!source) {
        await connection.rollback();
        throw new AddSimilarPracticeTaskError(
          "Task mapping was not found in this session.",
          "not_found",
        );
      }

      if (
        source.task_type !== TASK_TYPE_TOPIC ||
        INELIGIBLE_SESSION_TYPES.includes(source.session_type) ||
        source.session_status === SESSION_STATUS_COMPLETED ||
        source.theme_id == null
      ) {
        await connection.rollback();
        throw new AddSimilarPracticeTaskError(
          "Similar tasks are only offered for an active Practice-mode topic test.",
          "not_eligible",
        );
      }

      const nowSec = deps.nowSec ?? nowUnixSec;
      if (isSessionExpired(source.expire_time, nowSec())) {
        await connection.rollback();
        throw new AddSimilarPracticeTaskError(
          "This session's 24h lifetime has expired.",
          "session_expired",
        );
      }

      if (source.status !== TASK_STATUS_INCORRECT) {
        await connection.rollback();
        throw new AddSimilarPracticeTaskError(
          "A similar task is only offered after an incorrect answer.",
          "not_incorrect",
        );
      }

      const usedRows = await connection.query<UsedIdRow>(
        SQL_SELECT_USED_TASK_IDS,
        [sessionId],
      );
      const excludeTaskIds = usedRows.map((row) => row.task_id);

      const candidateRows = await connection.query<FollowUpCandidate>(
        SQL_SELECT_CANDIDATES,
        [source.theme_id],
      );
      const preferredDifficulty = resolvePreferredDifficulty(
        source.difficulty,
        streak,
      );
      const pickedId = selectFollowUpCandidate(
        candidateRows,
        excludeTaskIds,
        preferredDifficulty,
      );

      if (pickedId == null) {
        await connection.rollback();
        throw new AddSimilarPracticeTaskError(
          "No other task is available in this theme.",
          "no_similar_task",
        );
      }

      const inserted = await connection.execute(SQL_INSERT_MAPPING, [
        TASK_TYPE_TOPIC,
        pickedId,
        sessionId,
        userId,
        TASK_STATUS_UNANSWERED,
      ]);
      if (inserted.affectedRows !== 1) {
        await connection.rollback();
        throw new AddSimilarPracticeTaskError(
          "Failed to add the follow-up task.",
          "db_error",
        );
      }

      const newTaskRows = await connection.query<NewTaskRow>(
        SQL_SELECT_NEW_TASK,
        [pickedId],
      );
      const newTaskRow = newTaskRows[0];
      if (!newTaskRow) {
        await connection.rollback();
        throw new AddSimilarPracticeTaskError(
          "Follow-up task could not be loaded.",
          "db_error",
        );
      }

      await connection.commit();

      return {
        mappingId: inserted.insertId,
        task: mapNewTask(newTaskRow, inserted.insertId),
      };
    } catch (error) {
      if (!(error instanceof AddSimilarPracticeTaskError)) {
        await connection.rollback().catch(() => undefined);
      }
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof AddSimilarPracticeTaskError) throw error;
    console.error("addSimilarPracticeTask: unexpected database error", error);
    throw new AddSimilarPracticeTaskError(
      "Database operation failed.",
      "db_error",
    );
  }
}
