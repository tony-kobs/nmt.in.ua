import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { SESSION_STATUS_COMPLETED, SESSION_STATUS_CREATED } from "@/modules/sessions/types";
import {
  addSimilarPracticeTask,
  AddSimilarPracticeTaskError,
} from "./addSimilarPracticeTask";
import { TASK_STATUS_CORRECT, TASK_STATUS_INCORRECT, TASK_STATUS_UNANSWERED } from "./types";

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

function makeSourceRow(overrides: Partial<SourceRow> = {}): SourceRow {
  return {
    task_id: 100,
    status: TASK_STATUS_INCORRECT,
    task_type: 1,
    session_type: 1,
    session_status: SESSION_STATUS_CREATED,
    expire_time: 9_999_999_999,
    theme_id: 7,
    difficulty: 1,
    ...overrides,
  };
}

type Options = {
  source?: SourceRow[];
  usedTaskIds?: number[];
  candidates?: { id: number; difficulty: number }[];
  newTaskFound?: boolean;
  failInsert?: boolean;
};

function makeConnection(options: Options = {}) {
  const {
    source = [makeSourceRow()],
    usedTaskIds = [100],
    candidates = [
      { id: 100, difficulty: 1 },
      { id: 101, difficulty: 1 },
    ],
    newTaskFound = true,
    failInsert = false,
  } = options;

  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  let rolledBack = false;
  let committed = false;
  let released = false;

  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>(sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("FOR UPDATE")) return source as unknown as T[];
      if (sql.includes("task_id FROM tasks2session")) {
        return usedTaskIds.map((id) => ({ task_id: id })) as unknown as T[];
      }
      if (sql.includes("SELECT id, difficulty FROM quiz_tasks")) {
        return candidates as unknown as T[];
      }
      if (sql.includes("FROM quiz_tasks WHERE id = ?")) {
        return (newTaskFound
          ? [
              {
                id: params[0],
                name: "Similar task",
                task_text: "2x = 4",
                answer_1: "1",
                answer_2: "2",
                answer_3: "3",
                answer_4: "4",
              },
            ]
          : []) as unknown as T[];
      }
      return [] as T[];
    },
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.startsWith("INSERT INTO tasks2session")) {
        return { insertId: 999, affectedRows: failInsert ? 0 : 1 };
      }
      return { insertId: 0, affectedRows: 0 };
    },
    commit: async () => {
      committed = true;
    },
    rollback: async () => {
      rolledBack = true;
    },
    release: () => {
      released = true;
    },
  };

  return {
    connection,
    calls,
    isCommitted: () => committed,
    isRolledBack: () => rolledBack,
    isReleased: () => released,
  };
}

const validInput = { userId: 1, sessionId: 5, mappingId: 10, streak: 0 };

test("rejects invalid input", async () => {
  const mock = makeConnection();
  await assert.rejects(
    () =>
      addSimilarPracticeTask(
        { ...validInput, streak: -1 },
        { getConnection: async () => mock.connection },
      ),
    (error: unknown) =>
      error instanceof AddSimilarPracticeTaskError && error.code === "invalid_input",
  );
});

test("adds a same-theme task, excluding tasks already used in the session", async () => {
  const mock = makeConnection();

  const result = await addSimilarPracticeTask(validInput, {
    getConnection: async () => mock.connection,
  });

  assert.equal(result.mappingId, 999);
  assert.equal(result.task.taskId, 101);
  assert.equal(result.task.status, TASK_STATUS_UNANSWERED);
  assert.deepEqual(
    result.task.answers.map((a) => a.number),
    [1, 2, 3, 4],
  );

  const insert = mock.calls.find((c) => c.sql?.startsWith("INSERT INTO tasks2session"));
  assert.ok(insert);
  assert.deepEqual(insert!.params, [1, 101, 5, 1, TASK_STATUS_UNANSWERED]);
  assert.ok(mock.isCommitted());
  assert.ok(!mock.isRolledBack());
  assert.ok(mock.isReleased());
});

test("rejects when the source task was not answered incorrectly", async () => {
  const mock = makeConnection({
    source: [makeSourceRow({ status: TASK_STATUS_CORRECT })],
  });
  await assert.rejects(
    () =>
      addSimilarPracticeTask(validInput, { getConnection: async () => mock.connection }),
    (error: unknown) =>
      error instanceof AddSimilarPracticeTaskError && error.code === "not_incorrect",
  );
  assert.ok(mock.isRolledBack());
  assert.ok(!mock.isCommitted());
});

test("rejects diagnostic (5) and NMT (4) sessions", async () => {
  for (const sessionType of [4, 5]) {
    const mock = makeConnection({
      source: [makeSourceRow({ session_type: sessionType })],
    });
    await assert.rejects(
      () =>
        addSimilarPracticeTask(validInput, { getConnection: async () => mock.connection }),
      (error: unknown) =>
        error instanceof AddSimilarPracticeTaskError && error.code === "not_eligible",
    );
    assert.ok(mock.isRolledBack());
  }
});

test("rejects similar-task writes to a completed session", async () => {
  const mock = makeConnection({
    source: [makeSourceRow({ session_status: SESSION_STATUS_COMPLETED })],
  });
  await assert.rejects(
    () =>
      addSimilarPracticeTask(validInput, { getConnection: async () => mock.connection }),
    (error: unknown) =>
      error instanceof AddSimilarPracticeTaskError && error.code === "not_eligible",
  );
  assert.ok(mock.isRolledBack());
});

test("rejects once the active session's 24h deadline has passed", async () => {
  const now = 1_700_000_000;
  const mock = makeConnection({
    source: [makeSourceRow({ expire_time: now - 1 })],
  });

  await assert.rejects(
    () =>
      addSimilarPracticeTask(validInput, {
        getConnection: async () => mock.connection,
        nowSec: () => now,
      }),
    (error: unknown) =>
      error instanceof AddSimilarPracticeTaskError &&
      error.code === "session_expired",
  );
  assert.ok(mock.isRolledBack());
});

test("rejects a mapping that does not belong to this session or user", async () => {
  const mock = makeConnection({ source: [] });
  await assert.rejects(
    () =>
      addSimilarPracticeTask(validInput, { getConnection: async () => mock.connection }),
    (error: unknown) =>
      error instanceof AddSimilarPracticeTaskError && error.code === "not_found",
  );
});

test("reports no_similar_task when the theme bank is exhausted", async () => {
  const mock = makeConnection({
    usedTaskIds: [100, 101],
    candidates: [{ id: 100, difficulty: 1 }, { id: 101, difficulty: 1 }],
  });
  await assert.rejects(
    () =>
      addSimilarPracticeTask(validInput, { getConnection: async () => mock.connection }),
    (error: unknown) =>
      error instanceof AddSimilarPracticeTaskError && error.code === "no_similar_task",
  );
  assert.ok(mock.isRolledBack());
});

test("prefers a harder task once the streak clears the adaptive threshold", async () => {
  const mock = makeConnection({
    candidates: [
      { id: 100, difficulty: 1 },
      { id: 101, difficulty: 1 },
      { id: 102, difficulty: 2 },
    ],
  });

  const result = await addSimilarPracticeTask(
    { ...validInput, streak: 3 },
    { getConnection: async () => mock.connection },
  );

  assert.equal(result.task.taskId, 102);
});

test("rolls back and surfaces db_error when the insert fails", async () => {
  const mock = makeConnection({ failInsert: true });
  await assert.rejects(
    () =>
      addSimilarPracticeTask(validInput, { getConnection: async () => mock.connection }),
    (error: unknown) =>
      error instanceof AddSimilarPracticeTaskError && error.code === "db_error",
  );
  assert.ok(mock.isRolledBack());
});
