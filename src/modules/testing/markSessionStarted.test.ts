import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import {
  SESSION_STATUS_COMPLETED,
  SESSION_STATUS_CREATED,
} from "@/modules/sessions/types";
import {
  markSessionStarted,
  MarkSessionStartedError,
  validateMarkSessionStartedInput,
} from "./markSessionStarted";

type SessionRow = {
  id: number;
  start_time: number;
  session_status: number;
  expire_time: number;
};

function makeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 36,
    start_time: 0,
    session_status: SESSION_STATUS_CREATED,
    expire_time: 9_999_999_999,
    ...overrides,
  };
}

function makeConnection(options: {
  session?: SessionRow | null;
  failUpdate?: boolean;
}) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  let rolledBack = false;
  let committed = false;
  let released = false;

  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>(sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM task_sessions")) {
        return (
          options.session ? [options.session] : []
        ) as unknown as T[];
      }
      return [] as T[];
    },
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("UPDATE task_sessions")) {
        return {
          insertId: 0,
          affectedRows: options.failUpdate ? 0 : 1,
        };
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

const validInput = { userId: 1, sessionId: 36 };

test("validateMarkSessionStartedInput rejects non-positive ids", () => {
  assert.throws(
    () => validateMarkSessionStartedInput({ ...validInput, sessionId: 0 }),
    (error: unknown) =>
      error instanceof MarkSessionStartedError &&
      error.code === "invalid_input",
  );
});

test("sets start_time once when it is still 0", async () => {
  const mock = makeConnection({ session: makeSession() });
  const now = 1_700_000_000;

  const result = await markSessionStarted(validInput, {
    getConnection: async () => mock.connection,
    nowSec: () => now,
  });

  assert.deepEqual(result, { startTime: now });
  const update = mock.calls.find((c) => c.sql.includes("UPDATE task_sessions"));
  assert.ok(update);
  assert.deepEqual(update!.params, [now, 36]);
  assert.ok(mock.isCommitted());
  assert.ok(!mock.isRolledBack());
  assert.ok(mock.isReleased());
});

test("does not overwrite an existing start_time", async () => {
  const mock = makeConnection({
    session: makeSession({ start_time: 1_699_000_000 }),
  });

  const result = await markSessionStarted(validInput, {
    getConnection: async () => mock.connection,
    nowSec: () => 1_700_000_000,
  });

  assert.deepEqual(result, { startTime: 1_699_000_000 });
  assert.equal(
    mock.calls.filter((c) => c.sql.includes("UPDATE task_sessions")).length,
    0,
  );
  assert.ok(mock.isCommitted());
});

test("does not write start_time on a completed session", async () => {
  const mock = makeConnection({
    session: makeSession({
      session_status: SESSION_STATUS_COMPLETED,
      start_time: 0,
    }),
  });

  const result = await markSessionStarted(validInput, {
    getConnection: async () => mock.connection,
    nowSec: () => 1_700_000_000,
  });

  assert.deepEqual(result, { startTime: 0 });
  assert.equal(
    mock.calls.filter((c) => c.sql.includes("UPDATE task_sessions")).length,
    0,
  );
});

test("rejects an active session past its deadline", async () => {
  const now = 1_700_000_000;
  const mock = makeConnection({
    session: makeSession({ start_time: 0, expire_time: now - 1 }),
  });

  await assert.rejects(
    () =>
      markSessionStarted(validInput, {
        getConnection: async () => mock.connection,
        nowSec: () => now,
      }),
    (error: unknown) =>
      error instanceof MarkSessionStartedError &&
      error.code === "session_expired",
  );
  assert.ok(mock.isRolledBack());
  assert.equal(
    mock.calls.filter((c) => c.sql.includes("UPDATE task_sessions")).length,
    0,
  );
});

test("rejects re-marking an already-started session once it has expired", async () => {
  const now = 1_700_000_000;
  const mock = makeConnection({
    session: makeSession({ start_time: now - 90_000, expire_time: now - 1 }),
  });

  await assert.rejects(
    () =>
      markSessionStarted(validInput, {
        getConnection: async () => mock.connection,
        nowSec: () => now,
      }),
    (error: unknown) =>
      error instanceof MarkSessionStartedError &&
      error.code === "session_expired",
  );
});

test("still returns the stored start_time for a completed session past its deadline", async () => {
  const now = 1_700_000_000;
  const mock = makeConnection({
    session: makeSession({
      session_status: SESSION_STATUS_COMPLETED,
      start_time: now - 90_000,
      expire_time: now - 1,
    }),
  });

  const result = await markSessionStarted(validInput, {
    getConnection: async () => mock.connection,
    nowSec: () => now,
  });

  assert.deepEqual(result, { startTime: now - 90_000 });
});

test("rejects a session that does not belong to this user", async () => {
  const mock = makeConnection({ session: null });

  await assert.rejects(
    () =>
      markSessionStarted(validInput, {
        getConnection: async () => mock.connection,
      }),
    (error: unknown) =>
      error instanceof MarkSessionStartedError && error.code === "not_found",
  );
  assert.ok(mock.isRolledBack());
});
