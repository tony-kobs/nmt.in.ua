import type { SqlConnection } from "@/lib/db/mysql";
import { publishedQuizTaskSql } from "@/lib/publishedQuizTask";
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
    t2s.retry_used,
    t2s.task_type,
    ts.session_type,
    ts.session_status,
    ts.expire_time,
    ts.practice_streak,
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

const SQL_SELECT_CANDIDATES = `SELECT id, difficulty FROM quiz_tasks WHERE theme_id = ? AND ${publishedQuizTaskSql()}`;

const SQL_INSERT_MAPPING =
  "INSERT INTO tasks2session (task_type, task_id, session_id, user_id, status) VALUES (?, ?, ?, ?, ?)";

const SQL_SELECT_NEW_TASK = `
  SELECT id, name, task_text, answer_1, answer_2, answer_3, answer_4
  FROM quiz_tasks WHERE id = ?
`;

/** Idempotency/concurrency guard (see migration 027): a 'similar' follow-up
 * already recorded for this exact source mapping means a duplicate/retried
 * request should return that same follow-up, never insert a second one.
 * The source row's own `FOR UPDATE` lock above already serializes two
 * concurrent calls for the same `mappingId`, so by the time a second call
 * reaches this check the first call's origin row (if any) is already
 * committed and visible. */
const SQL_SELECT_EXISTING_ORIGIN = `
  SELECT tasks2session_id FROM practice_task_origin
  WHERE origin = 'similar' AND source_mapping_id = ?
`;

const SQL_SELECT_EXISTING_TASK = `
  SELECT t2s.id AS mapping_id, qt.id, qt.name, qt.task_text,
    qt.answer_1, qt.answer_2, qt.answer_3, qt.answer_4
  FROM tasks2session t2s
  INNER JOIN quiz_tasks qt ON qt.id = t2s.task_id
  WHERE t2s.id = ?
`;

const SQL_INSERT_ORIGIN =
  "INSERT INTO practice_task_origin (tasks2session_id, session_id, origin, source_mapping_id, created_at) VALUES (?, ?, 'similar', ?, ?)";

export type AddSimilarPracticeTaskInput = {
  userId: number;
  sessionId: number;
  mappingId: number;
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
  | "retry_pending"
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
  retry_used: number;
  task_type: number;
  session_type: number;
  session_status: number;
  expire_time: number;
  practice_streak: number;
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

type ExistingOriginRow = { tasks2session_id: number };

type ExistingTaskRow = NewTaskRow & { mapping_id: number };

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
  const { userId, sessionId, mappingId } = rawInput;
  if (
    !isPositiveInt(userId) ||
    !isPositiveInt(sessionId) ||
    !isPositiveInt(mappingId)
  ) {
    throw new AddSimilarPracticeTaskError(
      "userId, sessionId, mappingId must be positive integers.",
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

      // Now that Practice mode gives one retry after a first wrong answer
      // (see checkAnswer.ts), reinforcement must wait for that retry to be
      // consumed — i.e. the SECOND wrong attempt — instead of firing right
      // after the first miss.
      if (source.retry_used !== 1) {
        await connection.rollback();
        throw new AddSimilarPracticeTaskError(
          "A similar task is only offered once the retry has been used.",
          "retry_pending",
        );
      }

      // Idempotency/concurrency guard — see migration 027's note and
      // `SQL_SELECT_EXISTING_ORIGIN` above.
      const existingOrigin = await connection.query<ExistingOriginRow>(
        SQL_SELECT_EXISTING_ORIGIN,
        [mappingId],
      );
      if (existingOrigin[0]) {
        const existingTaskRows = await connection.query<ExistingTaskRow>(
          SQL_SELECT_EXISTING_TASK,
          [existingOrigin[0].tasks2session_id],
        );
        const existingTask = existingTaskRows[0];
        if (existingTask) {
          await connection.commit();
          return {
            mappingId: existingTask.mapping_id,
            task: mapNewTask(existingTask, existingTask.mapping_id),
          };
        }
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
      // The streak is read from the session row the server itself tracks
      // (`checkAnswer.ts`) — never a client-supplied number a student could
      // inflate to force a harder follow-up. Note this is necessarily 0 by
      // the time reinforcement fires: the wrong FIRST attempt that started
      // this whole flow already reset `practice_streak` to 0 (a wrong
      // answer always resets the streak, by definition), so
      // `resolvePreferredDifficulty` returns `null` here every time and
      // `selectFollowUpCandidate` falls back to "any task in the theme".
      // This intentionally drops the old client-trusted "still prefer a
      // harder follow-up if the student was on a hot streak before this
      // miss" heuristic in favor of not trusting client-supplied state —
      // reinforcement after two wrong attempts reinforcing at the SAME
      // difficulty (rather than harder) is arguably the more defensible
      // pedagogical default anyway.
      const preferredDifficulty = resolvePreferredDifficulty(
        source.difficulty,
        source.practice_streak,
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

      const nowSecValue = nowSec();
      const originInsert = await connection.execute(SQL_INSERT_ORIGIN, [
        inserted.insertId,
        sessionId,
        mappingId,
        nowSecValue,
      ]);
      if (originInsert.affectedRows !== 1) {
        await connection.rollback();
        throw new AddSimilarPracticeTaskError(
          "Failed to record the follow-up task's origin.",
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
