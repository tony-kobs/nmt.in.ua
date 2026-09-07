import { test } from "node:test";
import assert from "node:assert/strict";
import type { SqlConnection } from "@/lib/db/mysql";
import {
  startTopicTest,
  StartTopicTestError,
  TOPIC_TEST_TASK_COUNT,
} from "./startTopicTest";
import { ULTIMATE_TASK_LIMIT } from "./topicTestMode";

type Call = { sql: string; params: unknown[] };

const MAPPING_COLUMNS = ["task_type", "task_id", "session_id", "user_id", "status"] as const;

function makeConnection(options: {
  tasks: { id: number }[];
  failMapping?: boolean;
  failSelfScore?: boolean;
}) {
  const calls: Call[] = [];
  let rolledBack = false;
  let committed = false;
  let released = false;
  const nextSessionId = 100;

  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>(sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.startsWith("SELECT")) {
        const limitMatch = sql.match(/LIMIT (\d+)$/);
        const limit = limitMatch ? Number(limitMatch[1]) : options.tasks.length;
        return options.tasks.slice(0, limit) as unknown as T[];
      }
      return [] as T[];
    },
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("CREATE TABLE")) {
        return { insertId: 0, affectedRows: 0 };
      }
      if (sql.startsWith("INSERT INTO task_sessions")) {
        return { insertId: nextSessionId, affectedRows: 1 };
      }
      if (sql.startsWith("INSERT INTO tasks2session")) {
        const rowCount = params.length / MAPPING_COLUMNS.length;
        return {
          insertId: 0,
          affectedRows: options.failMapping ? rowCount - 1 : rowCount,
        };
      }
      if (sql.includes("INSERT INTO user_self_scores")) {
        return { insertId: 0, affectedRows: options.failSelfScore ? 0 : 1 };
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

function tasksFor(count: number, themeId: number) {
  return Array.from({ length: count }, (_, i) => ({ id: themeId * 1000 + i }));
}

/** Splits the flattened mapping-insert params into per-row column objects. */
function mappingRows(params: unknown[]): Record<(typeof MAPPING_COLUMNS)[number], unknown>[] {
  const rows = [];
  for (let i = 0; i < params.length; i += MAPPING_COLUMNS.length) {
    const row = {} as Record<(typeof MAPPING_COLUMNS)[number], unknown>;
    MAPPING_COLUMNS.forEach((col, offset) => {
      row[col] = params[i + offset];
    });
    rows.push(row);
  }
  return rows;
}

test("creates a session with fewer than TOPIC_TEST_TASK_COUNT when the bank is smaller", async () => {
  const themeId = 99901;
  const userId = 7;
  const availableCount = 4;
  const tasks = tasksFor(availableCount, themeId);
  const mock = makeConnection({ tasks });

  const result = await startTopicTest(
    { userId, themeId },
    { getConnection: async () => mock.connection },
  );

  assert.equal(result.taskIds.length, availableCount);

  const sessionInsert = mock.calls.find((c) =>
    c.sql.startsWith("INSERT INTO task_sessions"),
  );
  assert.equal(sessionInsert?.params[3], availableCount);

  const mappingCall = mock.calls.find((c) =>
    c.sql.startsWith("INSERT INTO tasks2session"),
  );
  assert.equal(mappingRows(mappingCall!.params).length, availableCount);
  assert.ok(mock.isCommitted());
});

test("creates a session and links exactly 10 distinct tasks from the requested theme", async () => {
  const themeId = 2;
  const userId = 7;
  const tasks = tasksFor(TOPIC_TEST_TASK_COUNT, themeId);
  const mock = makeConnection({ tasks });

  const result = await startTopicTest(
    { userId, themeId },
    { getConnection: async () => mock.connection },
  );

  assert.equal(result.themeId, themeId);
  assert.equal(result.taskIds.length, TOPIC_TEST_TASK_COUNT);
  assert.deepEqual(new Set(result.taskIds).size, TOPIC_TEST_TASK_COUNT);

  const selectCall = mock.calls.find((c) => c.sql.startsWith("SELECT"));
  assert.ok(selectCall);
  assert.equal(selectCall?.params[0], themeId);

  assert.ok(mock.isCommitted());
  assert.ok(!mock.isRolledBack());
  assert.ok(mock.isReleased());
});

test("ultimate mode selects up to 20 tasks", async () => {
  const themeId = 6;
  const userId = 3;
  const tasks = tasksFor(25, themeId);
  const mock = makeConnection({ tasks });

  const result = await startTopicTest(
    { userId, themeId, mode: "ultimate" },
    { getConnection: async () => mock.connection },
  );

  assert.equal(result.mode, "ultimate");
  assert.equal(result.taskIds.length, ULTIMATE_TASK_LIMIT);

  const selectCall = mock.calls.find((c) => c.sql.startsWith("SELECT"));
  assert.match(selectCall!.sql, new RegExp(`LIMIT ${ULTIMATE_TASK_LIMIT}$`));
});

test("inserts task_sessions with the exact verified numeric parameters, in order", async () => {
  const themeId = 5;
  const userId = 1;
  const tasks = tasksFor(TOPIC_TEST_TASK_COUNT, themeId);
  const mock = makeConnection({ tasks });

  await startTopicTest(
    { userId, themeId },
    { getConnection: async () => mock.connection },
  );

  const sessionInsert = mock.calls.find((c) =>
    c.sql.startsWith("INSERT INTO task_sessions"),
  );
  assert.ok(sessionInsert);
  assert.match(sessionInsert!.sql, /task_sessions/);
  assert.match(
    sessionInsert!.sql,
    /\(user_id, session_type, theme_id, tasks_number, right_number, time, session_status, start_time\)/,
  );
  assert.deepEqual(sessionInsert!.params, [
    userId, // user_id
    1, // session_type = 1 (topic test)
    themeId, // theme_id
    TOPIC_TEST_TASK_COUNT, // tasks_number = 10
    0, // right_number = 0
    0, // time = 0
    2, // session_status = 2
    0, // start_time = 0
  ]);
});

test("uses the real tasks2session table and inserts all mapping columns for exactly 10 rows", async () => {
  const themeId = 4;
  const userId = 9;
  const tasks = tasksFor(TOPIC_TEST_TASK_COUNT, themeId);
  const mock = makeConnection({ tasks });

  await startTopicTest(
    { userId, themeId },
    { getConnection: async () => mock.connection },
  );

  const mappingCall = mock.calls.find((c) =>
    c.sql.startsWith("INSERT INTO tasks2session"),
  );
  assert.ok(mappingCall);
  assert.doesNotMatch(mappingCall!.sql, /tasks2sesion(?!n)/);
  assert.match(
    mappingCall!.sql,
    /\(task_type, task_id, session_id, user_id, status\)/,
  );

  const rows = mappingRows(mappingCall!.params);
  assert.equal(rows.length, TOPIC_TEST_TASK_COUNT);

  const taskIds = new Set(rows.map((row) => row.task_id));
  assert.equal(taskIds.size, TOPIC_TEST_TASK_COUNT);

  for (const row of rows) {
    assert.equal(row.task_type, 1);
    assert.equal(row.session_id, 100);
    assert.equal(row.user_id, userId);
    assert.equal(row.status, 0);
    assert.ok(tasks.some((task) => task.id === row.task_id));
  }
});

test("rejects invalid input before touching the database", async () => {
  let called = false;
  await assert.rejects(
    () =>
      startTopicTest(
        { userId: 0, themeId: 2 },
        {
          getConnection: async () => {
            called = true;
            throw new Error("should not be called");
          },
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof StartTopicTestError);
      assert.equal((error as StartTopicTestError).code, "invalid_input");
      return true;
    },
  );
  assert.equal(called, false);
});

test("rolls back and reports insufficient_tasks when no tasks exist", async () => {
  const themeId = 3;
  const mock = makeConnection({ tasks: [] });

  await assert.rejects(
    () =>
      startTopicTest(
        { userId: 9, themeId },
        { getConnection: async () => mock.connection },
      ),
    (error: unknown) => {
      assert.ok(error instanceof StartTopicTestError);
      assert.equal((error as StartTopicTestError).code, "insufficient_tasks");
      return true;
    },
  );

  assert.ok(mock.isRolledBack());
  assert.ok(!mock.isCommitted());
  assert.ok(mock.isReleased());
  const sessionInsert = mock.calls.find((c) =>
    c.sql.startsWith("INSERT INTO task_sessions"),
  );
  assert.equal(sessionInsert, undefined);
});

test("creates a session when fewer than 10 tasks exist in the theme bank", async () => {
  const themeId = 3;
  const tasks = tasksFor(4, themeId);
  const mock = makeConnection({ tasks });

  const result = await startTopicTest(
    { userId: 9, themeId },
    { getConnection: async () => mock.connection },
  );

  assert.equal(result.taskIds.length, 4);
  assert.ok(mock.isCommitted());
});

test("rolls back the whole transaction and releases the connection when the mapping insert fails partially", async () => {
  const themeId = 1;
  const tasks = tasksFor(TOPIC_TEST_TASK_COUNT, themeId);
  const mock = makeConnection({ tasks, failMapping: true });

  await assert.rejects(
    () =>
      startTopicTest(
        { userId: 11, themeId },
        { getConnection: async () => mock.connection },
      ),
    (error: unknown) => {
      assert.ok(error instanceof StartTopicTestError);
      assert.equal((error as StartTopicTestError).code, "db_error");
      return true;
    },
  );

  assert.ok(mock.isRolledBack());
  assert.ok(!mock.isCommitted());
  assert.ok(mock.isReleased());
});

test("prevents a duplicate submission while a request is already pending for the same user", async () => {
  const themeId = 1;
  const tasks = tasksFor(TOPIC_TEST_TASK_COUNT, themeId);

  let releaseFirst: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const mock = makeConnection({ tasks });
  const slowConnection: SqlConnection = {
    ...mock.connection,
    beginTransaction: async () => {
      await gate;
    },
  };

  const first = startTopicTest(
    { userId: 42, themeId },
    { getConnection: async () => slowConnection },
  );

  await assert.rejects(
    () =>
      startTopicTest(
        { userId: 42, themeId },
        { getConnection: async () => mock.connection },
      ),
    (error: unknown) => {
      assert.ok(error instanceof StartTopicTestError);
      assert.equal(
        (error as StartTopicTestError).code,
        "already_in_progress",
      );
      return true;
    },
  );

  releaseFirst();
  const result = await first;
  assert.equal(result.themeId, themeId);
});

test("rejects a selfScore of 0 before touching the database", async () => {
  let called = false;
  await assert.rejects(
    () =>
      startTopicTest(
        { userId: 1, themeId: 2, selfScore: 0 },
        {
          getConnection: async () => {
            called = true;
            throw new Error("should not be called");
          },
        },
      ),
    (error: unknown) =>
      error instanceof StartTopicTestError && error.code === "invalid_input",
  );
  assert.equal(called, false);
});

test("rejects a selfScore of 11 before touching the database", async () => {
  await assert.rejects(
    () =>
      startTopicTest(
        { userId: 1, themeId: 2, selfScore: 11 },
        { getConnection: async () => { throw new Error("should not be called"); } },
      ),
    (error: unknown) =>
      error instanceof StartTopicTestError && error.code === "invalid_input",
  );
});

test("writes a pre_topic self-score row atomically with the session, inside the same transaction", async () => {
  const themeId = 8;
  const userId = 3;
  const tasks = tasksFor(TOPIC_TEST_TASK_COUNT, themeId);
  const mock = makeConnection({ tasks });

  await startTopicTest(
    { userId, themeId, selfScore: 7 },
    { getConnection: async () => mock.connection },
  );

  const selfScoreInsert = mock.calls.find((c) =>
    c.sql.includes("INSERT INTO user_self_scores"),
  );
  assert.ok(selfScoreInsert);
  assert.match(selfScoreInsert!.sql, /pre_topic/);
  assert.deepEqual(selfScoreInsert!.params, [userId, themeId, 7]);
  assert.ok(mock.isCommitted());

  // The task_sessions insert's own params are unaffected by the self-score
  // branch — still the exact 8-value array startTopicTest.ts always wrote.
  const sessionInsert = mock.calls.find((c) =>
    c.sql.startsWith("INSERT INTO task_sessions"),
  );
  assert.equal(sessionInsert!.params.length, 8);
});

test("omitting selfScore never touches user_self_scores", async () => {
  const themeId = 8;
  const tasks = tasksFor(TOPIC_TEST_TASK_COUNT, themeId);
  const mock = makeConnection({ tasks });

  await startTopicTest(
    { userId: 3, themeId },
    { getConnection: async () => mock.connection },
  );

  assert.equal(
    mock.calls.filter((c) => c.sql.includes("user_self_scores")).length,
    0,
  );
});

test("a DB failure on the self-score insert rolls back the whole transaction, including the session", async () => {
  const themeId = 8;
  const tasks = tasksFor(TOPIC_TEST_TASK_COUNT, themeId);
  const mock = makeConnection({ tasks, failSelfScore: true });

  await assert.rejects(
    () =>
      startTopicTest(
        { userId: 3, themeId, selfScore: 5 },
        { getConnection: async () => mock.connection },
      ),
    (error: unknown) =>
      error instanceof StartTopicTestError && error.code === "db_error",
  );

  assert.ok(mock.isRolledBack());
  assert.ok(!mock.isCommitted());
  assert.ok(mock.isReleased());
});
