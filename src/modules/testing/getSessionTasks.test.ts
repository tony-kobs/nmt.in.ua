import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import {
  getSessionTasks,
  GetSessionTasksError,
  validateSessionId,
} from "./getSessionTasks";

function makeRow(index: number) {
  return {
    mapping_id: 100 + index,
    task_id: index,
    status: 0,
    name: ` Task ${index} `,
    task_text: ` Text ${index} `,
    answer_1: ` A${index} `,
    answer_2: ` B${index} `,
    answer_3: ` C${index} `,
    answer_4: ` D${index} `,
  };
}

function makeSessionHeader() {
  return {
    id: 42,
    theme_id: 3,
    tasks_number: 10,
    right_number: 0,
    time: 0,
    session_status: 2,
    theme_code: "GEO-07-ELEM-PLAN",
    theme_name: "Тема",
  };
}

function makeConnection(rows: ReturnType<typeof makeRow>[], header = makeSessionHeader()) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  let released = false;

  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("FROM task_sessions")) {
        return [header] as never[];
      }
      return rows as never[];
    },
    execute: async () => ({ insertId: 0, affectedRows: 0 }),
    commit: async () => {},
    rollback: async () => {},
    release: () => {
      released = true;
    },
  };

  return { connection, calls, isReleased: () => released };
}

test("validateSessionId rejects non-positive values", () => {
  assert.throws(
    () => validateSessionId(0),
    (error: unknown) =>
      error instanceof GetSessionTasksError && error.code === "invalid_input",
  );
  assert.throws(
    () => validateSessionId("1"),
    (error: unknown) =>
      error instanceof GetSessionTasksError && error.code === "invalid_input",
  );
});

test("getSessionTasks joins tasks2session with quiz_tasks and maps client-safe fields", async () => {
  const rows = Array.from({ length: 10 }, (_, i) => makeRow(i + 1));
  const { connection, calls, isReleased } = makeConnection(rows);

  const result = await getSessionTasks(42, 1, {
    getConnection: async () => connection,
  });

  assert.equal(calls.length, 2);
  assert.match(calls[0]!.sql, /FROM task_sessions ts/);
  assert.match(calls[0]!.sql, /t\.code AS theme_code/);
  assert.deepEqual(calls[0]?.params, [42, 1]);
  assert.match(calls[1]!.sql, /FROM tasks2session t2s/);
  assert.match(calls[1]!.sql, /INNER JOIN quiz_tasks qt ON qt\.id = t2s\.task_id/);
  assert.match(calls[1]!.sql, /WHERE t2s\.session_id = \?/);
  assert.doesNotMatch(calls[1]!.sql, /right_answer_n/);
  assert.doesNotMatch(calls[1]!.sql, /comments/);
  assert.deepEqual(calls[1]?.params, [42]);

  assert.equal(result.sessionId, 42);
  assert.equal(result.sessionStatus, 2);
  assert.equal(result.themeId, 3);
  assert.equal(result.themeCode, "GEO-07-ELEM-PLAN");
  assert.equal(result.themeName, "Тема");
  assert.equal(result.summary, null);
  assert.equal(result.tasks.length, 10);
  assert.deepEqual(result.tasks[0], {
    mappingId: 101,
    taskId: 1,
    name: "Task 1",
    taskText: "Text 1",
    answers: [
      { number: 1, text: "A1" },
      { number: 2, text: "B1" },
      { number: 3, text: "C1" },
      { number: 4, text: "D1" },
    ],
    status: 0,
  });
  assert.equal(isReleased(), true);

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /right_answer_n/);
  assert.doesNotMatch(serialized, /comments/);
});

test("getSessionTasks returns planned-without-tasks marker for empty planned sessions", async () => {
  const { connection } = makeConnection([], {
    ...makeSessionHeader(),
    session_status: 3,
    tasks_number: 10,
  });

  const result = await getSessionTasks(99, 1, {
    getConnection: async () => connection,
  });

  assert.equal(result.sessionId, 99);
  assert.equal(result.sessionStatus, 3);
  assert.equal(result.themeId, 3);
  assert.equal(result.themeCode, "GEO-07-ELEM-PLAN");
  assert.equal(result.themeName, "Тема");
  assert.deepEqual(result.tasks, []);
  assert.equal(result.summary, null);
  assert.equal(result.isPlannedWithoutTasks, true);
});

test("getSessionTasks throws session_not_found when session exists but has no tasks and is not planned", async () => {
  const { connection } = makeConnection([]);

  await assert.rejects(
    () =>
      getSessionTasks(99, 1, {
        getConnection: async () => connection,
      }),
    (error: unknown) =>
      error instanceof GetSessionTasksError &&
      error.code === "session_not_found",
  );
});

test("getSessionTasks hydrates the summary when the session is already completed", async () => {
  const rows = Array.from({ length: 2 }, (_, i) => makeRow(i + 1));
  const { connection } = makeConnection(rows, {
    id: 7,
    theme_id: 4,
    tasks_number: 2,
    right_number: 1,
    time: 0,
    session_status: 1,
    theme_code: "ALG-09-EQ-INEQ",
    theme_name: " Синтаксис ",
  });

  const result = await getSessionTasks(7, 1, {
    getConnection: async () => connection,
  });

  assert.deepEqual(result.summary, {
    sessionId: 7,
    rightNumber: 1,
    tasksNumber: 2,
    percent: 50,
    timeSec: 0,
    themeId: 4,
    themeCode: "ALG-09-EQ-INEQ",
    themeName: "Синтаксис",
  });
});
