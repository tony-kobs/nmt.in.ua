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

function makeSession(status = SESSION_STATUS_PLANNED) {
  return {
    id: 12,
    user_id: 1,
    theme_id: 4,
    session_status: status,
  };
}

function makeConnection(options: {
  session?: ReturnType<typeof makeSession> | null;
  mappingCount?: number;
  tasks?: Array<{ id: number }>;
}) {
  const executeCalls: Array<{ sql: string; params: unknown[] }> = [];

  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async (sql) => {
      if (sql.includes("FROM task_sessions")) {
        return (options.session ? [options.session] : []) as never[];
      }
      if (sql.includes("COUNT(*)")) {
        return [{ mapping_count: options.mappingCount ?? 0 }] as never[];
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

  return { connection, executeCalls };
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
  const { connection, executeCalls } = makeConnection({
    session: makeSession(),
    tasks: [{ id: 10 }, { id: 11 }],
  });

  const result = await startPlannedSession(
    { userId: 1, sessionId: 12 },
    { getConnection: async () => connection },
  );

  assert.equal(result.sessionId, 12);
  assert.equal(result.themeId, 4);
  assert.deepEqual([...result.taskIds].sort((a, b) => a - b), [10, 11]);

  const mappingInsert = executeCalls.find((call) =>
    call.sql.includes("INSERT INTO tasks2session"),
  );
  assert.ok(mappingInsert);

  const update = executeCalls.find((call) =>
    call.sql.includes("UPDATE task_sessions"),
  );
  assert.deepEqual(update?.params, [2, SESSION_STATUS_CREATED, 12]);
});

test("startPlannedSession is idempotent when mappings already exist", async () => {
  const { connection, executeCalls } = makeConnection({
    session: makeSession(SESSION_STATUS_CREATED),
    mappingCount: 3,
  });

  const result = await startPlannedSession(
    { userId: 1, sessionId: 12 },
    { getConnection: async () => connection },
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
        { getConnection: async () => connection },
      ),
    (error: unknown) =>
      error instanceof StartPlannedSessionError &&
      error.code === "not_planned",
  );
});
