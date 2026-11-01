import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import {
  SESSION_STATUS_CREATED,
  SESSION_STATUS_PLANNED,
} from "@/modules/sessions/types";

import {
  startPlannedSession,
  StartPlannedSessionError,
  validateStartPlannedSessionInput,
} from "./startPlannedSession";

function makeSession(
  status = SESSION_STATUS_PLANNED,
  expireTime = 9_999_999_999,
  availableAt: number | null = null,
  difficulty: number | null = 1,
  learningSessionId: number | null = null,
) {
  return {
    id: 12,
    user_id: 1,
    theme_id: 4,
    session_status: status,
    expire_time: expireTime,
    available_at: availableAt,
    difficulty,
    learning_session_id: learningSessionId,
  };
}

function makeConnection(options: {
  session?: ReturnType<typeof makeSession> | null;
  mappingCount?: number;
  tasks?: Array<{ id: number }>;
}) {
  const executeCalls: Array<{ sql: string; params: unknown[] }> = [];
  const queryCalls: Array<{ sql: string; params: unknown[] }> = [];

  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async (sql, params: unknown[] = []) => {
      queryCalls.push({ sql, params });
      if (sql.includes("FROM task_sessions")) {
        return (options.session ? [options.session] : []) as never[];
      }
      if (sql.includes("COUNT(*)")) {
        return [{ mapping_count: options.mappingCount ?? 0 }] as never[];
      }
      if (sql.includes("FROM session_tasks")) {
        return (options.tasks ?? []) as never[];
      }
      if (sql.includes("FROM quiz_tasks")) {
        return (options.tasks ?? [{ id: 1 }, { id: 2 }]) as never[];
      }
      return [] as never[];
    },
    execute: async (sql, params: unknown[] = []) => {
      executeCalls.push({ sql, params });
      if (sql.includes("INSERT INTO tasks2session")) {
        return { insertId: 0, affectedRows: params.length / 5 };
      }
      if (sql.includes("UPDATE task_sessions")) {
        return { insertId: 0, affectedRows: 1 };
      }
      return { insertId: 0, affectedRows: 0 };
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };

  return { connection, executeCalls, queryCalls };
}

test("validateStartPlannedSessionInput rejects invalid payload", () => {
  assert.throws(
    () => validateStartPlannedSessionInput({ userId: 0, sessionId: 1 }),
    (error: unknown) =>
      error instanceof StartPlannedSessionError &&
      error.code === "invalid_input",
  );
});

test("startPlannedSession inserts mappings and activates planned session", async () => {
  const { connection, executeCalls, queryCalls } = makeConnection({
    session: makeSession(),
    tasks: [{ id: 10 }, { id: 11 }],
  });

  const result = await startPlannedSession(
    { userId: 1, sessionId: 12 },
    { getConnection: async () => connection, ensureSchema: async () => {} },
  );

  assert.equal(result.sessionId, 12);
  assert.equal(result.themeId, 4);
  assert.deepEqual([...result.taskIds].sort((a, b) => a - b), [10, 11]);

  const sessionSelect = queryCalls.find((call) =>
    call.sql.includes("FROM task_sessions"),
  );
  assert.ok(sessionSelect);
  assert.match(
    sessionSelect!.sql,
    /ma\.available_at\s*,\s*ma\.difficulty/,
    "SELECT must separate available_at and difficulty with a comma",
  );

  const taskSelect = queryCalls.find((call) =>
    call.sql.includes("FROM quiz_tasks"),
  );
  assert.deepEqual(taskSelect?.params, [4, 1]);

  const mappingInsert = executeCalls.find((call) =>
    call.sql.includes("INSERT INTO tasks2session"),
  );
  assert.ok(mappingInsert);

  const update = executeCalls.find((call) =>
    call.sql.includes("UPDATE task_sessions"),
  );
  assert.deepEqual(update?.params, [2, SESSION_STATUS_CREATED, 12]);
});

test("startPlannedSession uses the teacher session list in order", async () => {
  const { connection, queryCalls, executeCalls } = makeConnection({
    session: makeSession(SESSION_STATUS_PLANNED, 9_999_999_999, null, 1, 7),
    tasks: [
      { id: 30 },
      { id: 10 },
      { id: 20 },
    ],
  });

  const result = await startPlannedSession(
    { userId: 1, sessionId: 12 },
    { getConnection: async () => connection, ensureSchema: async () => {} },
  );

  assert.deepEqual(result.taskIds, [30, 10, 20]);
  const taskSelect = queryCalls.find((call) => call.sql.includes("session_tasks"));
  assert.deepEqual(taskSelect?.params, [7]);
  assert.equal(
    queryCalls.some((call) => call.sql.includes("FROM quiz_tasks")),
    false,
  );
  const mapping = executeCalls.find((call) =>
    call.sql.includes("INSERT INTO tasks2session"),
  );
  const linked: number[] = [];
  const params = mapping?.params ?? [];
  for (let index = 1; index < params.length; index += 5) {
    linked.push(Number(params[index]));
  }
  assert.deepEqual(linked, [30, 10, 20]);
});

test("startPlannedSession without mentor difficulty picks any theme tasks", async () => {
  const { connection, queryCalls } = makeConnection({
    session: makeSession(SESSION_STATUS_PLANNED, 9_999_999_999, null, null),
    tasks: [{ id: 10 }, { id: 11 }],
  });

  await startPlannedSession(
    { userId: 1, sessionId: 12 },
    { getConnection: async () => connection, ensureSchema: async () => {} },
  );

  const taskSelect = queryCalls.find((call) =>
    call.sql.includes("FROM quiz_tasks"),
  );
  assert.ok(taskSelect);
  assert.equal(taskSelect!.sql.includes("difficulty"), false);
  assert.deepEqual(taskSelect!.params, [4]);
});

test("startPlannedSession is idempotent when mappings already exist", async () => {
  const { connection, executeCalls } = makeConnection({
    session: makeSession(SESSION_STATUS_CREATED),
    mappingCount: 3,
  });

  const result = await startPlannedSession(
    { userId: 1, sessionId: 12 },
    { getConnection: async () => connection, ensureSchema: async () => {} },
  );

  assert.deepEqual(result, { sessionId: 12, themeId: 4, taskIds: [] });
  assert.equal(executeCalls.length, 0);
});

test("startPlannedSession rejects non-planned sessions without mappings", async () => {
  const { connection } = makeConnection({
    session: makeSession(SESSION_STATUS_CREATED),
    mappingCount: 0,
  });

  await assert.rejects(
    () =>
      startPlannedSession(
        { userId: 1, sessionId: 12 },
        { getConnection: async () => connection, ensureSchema: async () => {} },
      ),
    (error: unknown) =>
      error instanceof StartPlannedSessionError &&
      error.code === "not_planned",
  );
});

test("startPlannedSession never activates an expired planned row", async () => {
  const now = 1_700_000_000;
  const { connection, executeCalls } = makeConnection({
    session: makeSession(SESSION_STATUS_PLANNED, now - 1),
    tasks: [{ id: 10 }, { id: 11 }],
  });

  await assert.rejects(
    () =>
      startPlannedSession(
        { userId: 1, sessionId: 12 },
        { getConnection: async () => connection, nowSec: () => now, ensureSchema: async () => {} },
      ),
    (error: unknown) =>
      error instanceof StartPlannedSessionError &&
      error.code === "session_expired",
  );
  assert.equal(executeCalls.length, 0);
});

test("startPlannedSession rejects an expired session even when mappings already exist (no renewal)", async () => {
  const now = 1_700_000_000;
  const { connection, executeCalls } = makeConnection({
    session: makeSession(SESSION_STATUS_CREATED, now - 1),
    mappingCount: 3,
  });

  await assert.rejects(
    () =>
      startPlannedSession(
        { userId: 1, sessionId: 12 },
        { getConnection: async () => connection, nowSec: () => now, ensureSchema: async () => {} },
      ),
    (error: unknown) =>
      error instanceof StartPlannedSessionError &&
      error.code === "session_expired",
  );
  assert.equal(executeCalls.length, 0);
});

test("startPlannedSession rejects before available_at", async () => {
  const now = 1_700_000_000;
  const availableAt = now + 3600;
  const { connection, executeCalls } = makeConnection({
    session: makeSession(SESSION_STATUS_PLANNED, availableAt + 86_400, availableAt),
    tasks: [{ id: 10 }],
  });

  await assert.rejects(
    () =>
      startPlannedSession(
        { userId: 1, sessionId: 12 },
        { getConnection: async () => connection, nowSec: () => now, ensureSchema: async () => {} },
      ),
    (error: unknown) =>
      error instanceof StartPlannedSessionError &&
      error.code === "not_yet_available" &&
      error.availableAt === availableAt,
  );
  assert.equal(executeCalls.length, 0);
});

test("startPlannedSession activates once available_at has passed", async () => {
  const now = 1_700_000_000;
  const availableAt = now - 10;
  const { connection } = makeConnection({
    session: makeSession(
      SESSION_STATUS_PLANNED,
      availableAt + 86_400,
      availableAt,
    ),
    tasks: [{ id: 10 }, { id: 11 }],
  });

  const result = await startPlannedSession(
    { userId: 1, sessionId: 12 },
    { getConnection: async () => connection, nowSec: () => now, ensureSchema: async () => {} },
  );
  assert.equal(result.sessionId, 12);
});
