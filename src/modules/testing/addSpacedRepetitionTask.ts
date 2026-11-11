import type { SqlConnection } from "@/lib/db/mysql";
import { publishedQuizTaskSql } from "@/lib/publishedQuizTask";
import { SESSION_STATUS_COMPLETED } from "@/modules/sessions/types";
import { nowUnixSec } from "./sessionElapsed";
import { isSessionExpired } from "./sessionExpiry";
import {
  findThemeDueForRepetition,
  type AnsweredTopicTask,
} from "./practiceSpacedRepetition";
import { selectFollowUpCandidate } from "./pickPracticeFollowUpTask";
import { TASK_STATUS_CORRECT, TASK_STATUS_UNANSWERED } from "./types";
import type { SessionTask } from "./types";

/** Verified `tasks2session.task_type` for the topic-test bank. */
const TASK_TYPE_TOPIC = 1;
/** Same ineligible session types as every other Practice-only feature —
 * 4 = NMT simulator, 5 = diagnostic. */
const INELIGIBLE_SESSION_TYPES = [4, 5];

/** `FOR UPDATE` locks the session row for the whole decide-and-write
 * transaction below — the same idempotency pattern used everywhere else in
 * this module (see `checkAnswer.ts`'s "if row.status !== UNANSWERED,
 * return as-is" guard). Two concurrent calls for the SAME session fully
 * serialize on this lock: the second one only proceeds once the first has
 * committed (or rolled back), and by then it re-reads history fresh —
 * including the first call's newly committed repetition row and its
 * `practice_task_origin` tag — so `findThemeDueForRepetition` correctly sees
 * that theme as already handled and never inserts a duplicate. */
const SQL_SELECT_SESSION = `
  SELECT session_type, session_status, expire_time
  FROM task_sessions
  WHERE id = ? AND user_id = ?
  FOR UPDATE
`;

/** Every answered topic-bank task in the session, oldest first, scored by
 * its permanent first-attempt outcome — never a retry/reinforcement result.
 * `origin` (from `practice_task_origin`, see migration 027) is NULL for an
 * ordinary original task and 'similar'/'repetition' for a follow-up row —
 * exactly what `findThemeDueForRepetition`'s `isFollowUp` flag needs, read
 * from durable state rather than approximated. */
const SQL_SELECT_HISTORY = `
  SELECT qt.theme_id AS theme_id,
    COALESCE(t2s.first_attempt_status, t2s.status) AS status,
    po.origin AS origin
  FROM tasks2session t2s
  INNER JOIN quiz_tasks qt ON qt.id = t2s.task_id
  LEFT JOIN practice_task_origin po ON po.tasks2session_id = t2s.id
  WHERE t2s.session_id = ?
    AND t2s.user_id = ?
    AND t2s.task_type = ${TASK_TYPE_TOPIC}
    AND t2s.status <> ${TASK_STATUS_UNANSWERED}
  ORDER BY t2s.id ASC
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

const SQL_INSERT_ORIGIN =
  "INSERT INTO practice_task_origin (tasks2session_id, session_id, origin, source_mapping_id, created_at) VALUES (?, ?, 'repetition', NULL, ?)";

export type AddSpacedRepetitionTaskInput = {
  userId: number;
  sessionId: number;
};

export type AddSpacedRepetitionTaskResult =
  | { added: true; mappingId: number; task: SessionTask }
  | { added: false };

export type AddSpacedRepetitionTaskErrorCode =
  | "invalid_input"
  | "not_found"
  | "not_eligible"
  | "session_expired"
  | "db_error";

export class AddSpacedRepetitionTaskError extends Error {
  constructor(
    message: string,
    public readonly code: AddSpacedRepetitionTaskErrorCode,
  ) {
    super(message);
    this.name = "AddSpacedRepetitionTaskError";
  }
}

type SessionRow = {
  session_type: number;
  session_status: number;
  expire_time: number;
};
type HistoryRow = {
  theme_id: number | null;
  status: number;
  origin: "similar" | "repetition" | null;
};
type UsedIdRow = { task_id: number };
type CandidateRow = { id: number; difficulty: number };
type NewTaskRow = {
  id: number;
  name: string;
  task_text: string;
  answer_1: string | null;
  answer_2: string | null;
  answer_3: string | null;
  answer_4: string | null;
};

type Deps = {
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
 * "Spaced repetition of a theme after a few intervening tasks": checked
 * opportunistically (e.g. right after any answer) rather than on a user
 * action — so unlike `addSimilarPracticeTask`, nothing being due yet, or no
 * candidate task existing, is a normal `{ added: false }` result rather than
 * an error. Reuses the exact same "append one more row to the SAME session"
 * pattern.
 */
export async function addSpacedRepetitionTask(
  rawInput: AddSpacedRepetitionTaskInput,
  deps: Deps = { getConnection: loadDefaultConnection },
): Promise<AddSpacedRepetitionTaskResult> {
  const { userId, sessionId } = rawInput;
  if (!isPositiveInt(userId) || !isPositiveInt(sessionId)) {
    throw new AddSpacedRepetitionTaskError(
      "userId and sessionId must be positive integers.",
      "invalid_input",
    );
  }

  try {
    const connection = await deps.getConnection();
    try {
      await connection.beginTransaction();

      const sessions = await connection.query<SessionRow>(SQL_SELECT_SESSION, [
        sessionId,
        userId,
      ]);
      const session = sessions[0];
      if (!session) {
        await connection.rollback();
        throw new AddSpacedRepetitionTaskError(
          "Session was not found for this user.",
          "not_found",
        );
      }
      if (
        INELIGIBLE_SESSION_TYPES.includes(session.session_type) ||
        session.session_status === SESSION_STATUS_COMPLETED
      ) {
        await connection.rollback();
        throw new AddSpacedRepetitionTaskError(
          "Spaced repetition only applies to an active Practice-mode topic test.",
          "not_eligible",
        );
      }
      const nowSec = deps.nowSec ?? nowUnixSec;
      if (isSessionExpired(session.expire_time, nowSec())) {
        await connection.rollback();
        throw new AddSpacedRepetitionTaskError(
          "This session's 24h lifetime has expired.",
          "session_expired",
        );
      }

      const historyRows = await connection.query<HistoryRow>(
        SQL_SELECT_HISTORY,
        [sessionId, userId],
      );
      const history: AnsweredTopicTask[] = historyRows
        .filter((row) => row.theme_id != null)
        .map((row) => ({
          themeId: row.theme_id as number,
          correct: row.status === TASK_STATUS_CORRECT,
          isFollowUp: row.origin != null,
        }));

      const dueThemeId = findThemeDueForRepetition(history);
      if (dueThemeId == null) {
        await connection.commit();
        return { added: false };
      }

      const usedRows = await connection.query<UsedIdRow>(
        SQL_SELECT_USED_TASK_IDS,
        [sessionId],
      );
      const excludeTaskIds = usedRows.map((row) => row.task_id);

      const candidateRows = await connection.query<CandidateRow>(
        SQL_SELECT_CANDIDATES,
        [dueThemeId],
      );
      const pickedId = selectFollowUpCandidate(candidateRows, excludeTaskIds, null);
      if (pickedId == null) {
        await connection.commit();
        return { added: false };
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
        throw new AddSpacedRepetitionTaskError(
          "Failed to add the repetition task.",
          "db_error",
        );
      }

      const newTaskRows = await connection.query<NewTaskRow>(SQL_SELECT_NEW_TASK, [
        pickedId,
      ]);
      const newTaskRow = newTaskRows[0];
      if (!newTaskRow) {
        await connection.rollback();
        throw new AddSpacedRepetitionTaskError(
          "Repetition task could not be loaded.",
          "db_error",
        );
      }

      const originInsert = await connection.execute(SQL_INSERT_ORIGIN, [
        inserted.insertId,
        sessionId,
        nowSec(),
      ]);
      if (originInsert.affectedRows !== 1) {
        await connection.rollback();
        throw new AddSpacedRepetitionTaskError(
          "Failed to record the repetition task's origin.",
          "db_error",
        );
      }

      await connection.commit();
      return {
        added: true,
        mappingId: inserted.insertId,
        task: mapNewTask(newTaskRow, inserted.insertId),
      };
    } catch (error) {
      if (!(error instanceof AddSpacedRepetitionTaskError)) {
        await connection.rollback().catch(() => undefined);
      }
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof AddSpacedRepetitionTaskError) throw error;
    console.error("addSpacedRepetitionTask: unexpected database error", error);
    throw new AddSpacedRepetitionTaskError("Database operation failed.", "db_error");
  }
}
