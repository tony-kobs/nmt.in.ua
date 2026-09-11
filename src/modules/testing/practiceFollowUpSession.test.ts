import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { SESSION_STATUS_CREATED, SESSION_TYPE_USER } from "@/modules/sessions/types";
import { checkAnswer } from "./checkAnswer";
import { addSimilarPracticeTask } from "./addSimilarPracticeTask";
import { finishTrainerSession } from "./finishTrainerSession";
import { TASK_STATUS_UNANSWERED } from "./types";

/**
 * End-to-end regression for Practice mode's "similar task" flow: a wrong
 * answer appends one more `tasks2session` row to the SAME session
 * (`addSimilarPracticeTask.ts`), and `finishTrainerSession` must score that
 * row exactly like every other one — no separate client-side tally. A single
 * in-memory `tasks2session` table is shared across `checkAnswer`,
 * `addSimilarPracticeTask` and `finishTrainerSession` calls (three separate
 * "connections" against the same fake store) so the scenario matches what
 * actually happens across three Server Action round-trips against one row of
 * `task_sessions`.
 */

const USER_ID = 1;
const SESSION_ID = 5;
const THEME_ID = 7;

type QuizTaskRow = {
  id: number;
  theme_id: number;
  difficulty: number;
  name: string;
  task_text: string;
  answer_1: string;
  answer_2: string;
  answer_3: string;
  answer_4: string;
  right_answer_n: number;
};

type MappingRow = {
  id: number;
  session_id: number;
  user_id: number;
  task_id: number;
  task_type: number;
  status: number;
};

function makeQuizBank(): QuizTaskRow[] {
  return [101, 102, 103, 104].map((id, index) => ({
    id,
    theme_id: THEME_ID,
    difficulty: 1,
    name: `Task ${id}`,
    task_text: `${id} = ?`,
    answer_1: "1",
    answer_2: "2",
    answer_3: "3",
    answer_4: "4",
    right_answer_n: index + 1,
  }));
}

/** Shared fake store standing in for `task_sessions` + `tasks2session` across
 * all three domain calls in the scenario. */
function makeSharedStore() {
  const quizBank = makeQuizBank();
  const mappings: MappingRow[] = [101, 102, 103].map((taskId, index) => ({
    id: index + 1,
    session_id: SESSION_ID,
    user_id: USER_ID,
    task_id: taskId,
    task_type: 1,
    status: TASK_STATUS_UNANSWERED,
  }));
  let nextMappingId = mappings.length + 1;
  const session = {
    id: SESSION_ID,
    user_id: USER_ID,
    theme_id: THEME_ID,
    session_type: SESSION_TYPE_USER,
    tasks_number: 3,
    right_number: 0,
    time: 0,
    start_time: 1_700_000_000,
    session_status: SESSION_STATUS_CREATED,
    theme_code: "ALG-01-TEST",
    theme_name: "Тестова тема",
    variant_label: null as string | null,
  };

  function connectionFactory(): () => Promise<SqlConnection> {
    return async () => {
      const connection: SqlConnection = {
        beginTransaction: async () => {},
        commit: async () => {},
        rollback: async () => {},
        release: () => {},
        query: async <T,>(sql: string, params: unknown[] = []) => {
          // checkAnswer: mapping + answer key lookup.
          if (sql.includes("nqt.right_answer_n")) {
            const [mappingId, sessionId, userId] = params as number[];
            const row = mappings.find(
              (m) =>
                m.id === mappingId &&
                m.session_id === sessionId &&
                m.user_id === userId,
            );
            if (!row) return [] as T[];
            const quizTask = quizBank.find((q) => q.id === row.task_id);
            return [
              {
                id: row.id,
                session_id: row.session_id,
                status: row.status,
                user_id: row.user_id,
                task_type: row.task_type,
                right_answer_n: quizTask?.right_answer_n ?? null,
                right_answer_text: null,
                task_kind: "mcq",
                session_status: session.session_status,
              },
            ] as unknown as T[];
          }

          // addSimilarPracticeTask: source row `FOR UPDATE` lookup.
          if (sql.includes("qt.difficulty")) {
            const [mappingId, sessionId, userId] = params as number[];
            const row = mappings.find(
              (m) =>
                m.id === mappingId &&
                m.session_id === sessionId &&
                m.user_id === userId,
            );
            if (!row) return [] as T[];
            const quizTask = quizBank.find((q) => q.id === row.task_id);
            return [
              {
                task_id: row.task_id,
                status: row.status,
                task_type: row.task_type,
                session_type: session.session_type,
                theme_id: quizTask?.theme_id ?? null,
                difficulty: quizTask?.difficulty ?? 1,
              },
            ] as unknown as T[];
          }

          // addSimilarPracticeTask: already-used task ids in this session.
          if (sql.includes("task_id FROM tasks2session")) {
            const [sessionId] = params as number[];
            return mappings
              .filter((m) => m.session_id === sessionId && m.task_type === 1)
              .map((m) => ({ task_id: m.task_id })) as unknown as T[];
          }

          // addSimilarPracticeTask: same-theme candidate pool.
          if (sql.includes("SELECT id, difficulty FROM quiz_tasks")) {
            const [themeId] = params as number[];
            return quizBank
              .filter((q) => q.theme_id === themeId)
              .map((q) => ({ id: q.id, difficulty: q.difficulty })) as unknown as T[];
          }

          // addSimilarPracticeTask: newly inserted task's client-safe fields.
          if (sql.includes("SELECT id, name, task_text, answer_1")) {
            const [taskId] = params as number[];
            const quizTask = quizBank.find((q) => q.id === taskId);
            if (!quizTask) return [] as T[];
            return [
              {
                id: quizTask.id,
                name: quizTask.name,
                task_text: quizTask.task_text,
                answer_1: quizTask.answer_1,
                answer_2: quizTask.answer_2,
                answer_3: quizTask.answer_3,
                answer_4: quizTask.answer_4,
              },
            ] as unknown as T[];
          }

          // finishTrainerSession: session header `FOR UPDATE` lookup.
          if (sql.includes("FROM task_sessions") && sql.includes("LEFT JOIN themes")) {
            const [sessionId, userId] = params as number[];
            if (session.id !== sessionId || session.user_id !== userId) {
              return [] as T[];
            }
            return [{ ...session }] as unknown as T[];
          }

          // finishTrainerSession: every mapping's current status.
          if (sql.includes("SELECT status") && sql.includes("FROM tasks2session")) {
            const [sessionId, userId] = params as number[];
            return mappings
              .filter((m) => m.session_id === sessionId && m.user_id === userId)
              .map((m) => ({ status: m.status })) as unknown as T[];
          }

          throw new Error(`Unhandled query in test fake: ${sql}`);
        },
        execute: async (sql: string, params: unknown[] = []) => {
          if (sql.startsWith("INSERT INTO tasks2session")) {
            const [taskType, taskId, sessionId, userId, status] =
              params as number[];
            const id = nextMappingId++;
            mappings.push({
              id,
              session_id: sessionId,
              user_id: userId,
              task_id: taskId,
              task_type: taskType,
              status,
            });
            return { insertId: id, affectedRows: 1 };
          }

          if (sql.startsWith("UPDATE tasks2session SET status")) {
            const [status, mappingId] = params as number[];
            const row = mappings.find((m) => m.id === mappingId);
            if (row) row.status = status;
            return { insertId: 0, affectedRows: row ? 1 : 0 };
          }

          if (sql.includes("UPDATE task_sessions") && sql.includes("SET right_number")) {
            const [rightNumber, tasksNumber, sessionStatus, timeSec, startTime] =
              params as number[];
            session.right_number = rightNumber;
            session.tasks_number = tasksNumber;
            session.session_status = sessionStatus;
            session.time = timeSec;
            session.start_time = startTime;
            return { insertId: 0, affectedRows: 1 };
          }

          throw new Error(`Unhandled execute in test fake: ${sql}`);
        },
      };
      return connection;
    };
  }

  return { getConnection: connectionFactory(), mappings };
}

test("similar task stays in the active session and scores like every other task", async () => {
  const store = makeSharedStore();
  const deps = { getConnection: store.getConnection };

  // Task 1 (mapping 1, task 101): correct.
  const answer1 = await checkAnswer(
    { userId: USER_ID, sessionId: SESSION_ID, mappingId: 1, answerNumber: 1 },
    deps,
  );
  assert.equal(answer1.correct, true);

  // Task 2 (mapping 2, task 102): incorrect.
  const answer2 = await checkAnswer(
    { userId: USER_ID, sessionId: SESSION_ID, mappingId: 2, answerNumber: 4 },
    deps,
  );
  assert.equal(answer2.correct, false);

  // "Similar task" after the miss on task 2 — appends one row to the SAME
  // session rather than starting a new one.
  const similar = await addSimilarPracticeTask(
    { userId: USER_ID, sessionId: SESSION_ID, mappingId: 2, streak: 0 },
    deps,
  );
  assert.equal(similar.task.taskId, 104);
  assert.equal(store.mappings.length, 4);
  assert.ok(
    store.mappings.every((m) => m.session_id === SESSION_ID),
    "the follow-up task belongs to the same session, not a new one",
  );

  // The follow-up task (mapping 4, task 104): correct.
  const answerSimilar = await checkAnswer(
    {
      userId: USER_ID,
      sessionId: SESSION_ID,
      mappingId: similar.mappingId,
      answerNumber: 4,
    },
    deps,
  );
  assert.equal(answerSimilar.correct, true);

  // Task 3 (mapping 3, task 103): correct.
  const answer3 = await checkAnswer(
    { userId: USER_ID, sessionId: SESSION_ID, mappingId: 3, answerNumber: 3 },
    deps,
  );
  assert.equal(answer3.correct, true);

  const summary = await finishTrainerSession(
    { userId: USER_ID, sessionId: SESSION_ID },
    deps,
  );

  // 3 original tasks + 1 dynamically appended follow-up = 4; 1 initial miss
  // was corrected via the follow-up, task 2 itself stays counted as wrong —
  // 3 right answers out of 4 total.
  assert.equal(summary.tasksNumber, 4);
  assert.equal(summary.rightNumber, 3);
  assert.equal(summary.percent, 75);
});

test("finishing without answering the appended follow-up task is rejected", async () => {
  const store = makeSharedStore();
  const deps = { getConnection: store.getConnection };

  await checkAnswer(
    { userId: USER_ID, sessionId: SESSION_ID, mappingId: 1, answerNumber: 1 },
    deps,
  );
  await checkAnswer(
    { userId: USER_ID, sessionId: SESSION_ID, mappingId: 2, answerNumber: 4 },
    deps,
  );
  await addSimilarPracticeTask(
    { userId: USER_ID, sessionId: SESSION_ID, mappingId: 2, streak: 0 },
    deps,
  );
  await checkAnswer(
    { userId: USER_ID, sessionId: SESSION_ID, mappingId: 3, answerNumber: 3 },
    deps,
  );

  await assert.rejects(() =>
    finishTrainerSession({ userId: USER_ID, sessionId: SESSION_ID }, deps),
  );
});
