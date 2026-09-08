import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import {
  SESSION_STATUS_COMPLETED,
  SESSION_STATUS_CREATED,
} from "@/modules/sessions/types";
import {
  finishTrainerSession,
  FinishTrainerSessionError,
  validateFinishTrainerSessionInput,
} from "./finishTrainerSession";
import {
  TASK_STATUS_CORRECT,
  TASK_STATUS_INCORRECT,
  TASK_STATUS_UNANSWERED,
} from "./types";

type SessionRow = {
  id: number;
  user_id: number;
  theme_id: number;
  tasks_number: number;
  right_number: number;
  time: number;
  start_time: number;
  session_status: number;
  theme_code: string;
  theme_name: string;
};

function makeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 5,
    user_id: 1,
    theme_id: 3,
    tasks_number: 10,
    right_number: 0,
    time: 0,
    start_time: 1_700_000_000,
    session_status: SESSION_STATUS_CREATED,
    theme_code: "GEO-07-ELEM-PLAN",
    theme_name: " Відмінювання ",
    ...overrides,
  };
}

function makeConnection(options: {
  session?: SessionRow | null;
  statuses?: number[];
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
      if (sql.includes("FROM tasks2session")) {
        return (options.statuses ?? []).map((status) => ({
          status,
        })) as unknown as T[];
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

const validInput = { userId: 1, sessionId: 5 };

test("validateFinishTrainerSessionInput rejects non-positive ids", () => {
  assert.throws(
    () => validateFinishTrainerSessionInput({ ...validInput, sessionId: 0 }),
    (error: unknown) =>
      error instanceof FinishTrainerSessionError &&
      error.code === "invalid_input",
  );
  assert.throws(
    () => validateFinishTrainerSessionInput({ userId: 1, sessionId: "5" }),
    (error: unknown) =>
      error instanceof FinishTrainerSessionError &&
      error.code === "invalid_input",
  );
});

test("aggregates correct answers and marks the session completed", async () => {
  const statuses = [
    TASK_STATUS_CORRECT,
    TASK_STATUS_CORRECT,
    TASK_STATUS_INCORRECT,
    TASK_STATUS_CORRECT,
    TASK_STATUS_INCORRECT,
    TASK_STATUS_CORRECT,
    TASK_STATUS_INCORRECT,
    TASK_STATUS_CORRECT,
    TASK_STATUS_INCORRECT,
    TASK_STATUS_CORRECT,
  ];
  const mock = makeConnection({
    session: makeSession(),
    statuses,
  });

  const result = await finishTrainerSession(validInput, {
    getConnection: async () => mock.connection,
    nowSec: () => 1_700_000_080,
  });

  assert.deepEqual(result, {
    sessionId: 5,
    rightNumber: 6,
    tasksNumber: 10,
    percent: 60,
    timeSec: 80,
    themeId: 3,
    themeCode: "GEO-07-ELEM-PLAN",
    themeName: "Відмінювання",
  });

  const update = mock.calls.find((c) => c.sql.includes("UPDATE task_sessions"));
  assert.ok(update);
  assert.deepEqual(update!.params, [
    6,
    10,
    SESSION_STATUS_COMPLETED,
    80,
    1_700_000_000,
    5,
  ]);
  assert.ok(mock.isCommitted());
  assert.ok(!mock.isRolledBack());
  assert.ok(mock.isReleased());
});

test("rejects when any mapping is still unanswered", async () => {
  const mock = makeConnection({
    session: makeSession(),
    statuses: [TASK_STATUS_CORRECT, TASK_STATUS_UNANSWERED],
  });

  await assert.rejects(
    () =>
      finishTrainerSession(validInput, {
        getConnection: async () => mock.connection,
      }),
    (error: unknown) =>
      error instanceof FinishTrainerSessionError && error.code === "unfinished",
  );
  assert.ok(mock.isRolledBack());
  assert.equal(
    mock.calls.filter((c) => c.sql.includes("UPDATE task_sessions")).length,
    0,
  );
});

test("rejects a session that does not belong to this user", async () => {
  const mock = makeConnection({ session: null });

  await assert.rejects(
    () =>
      finishTrainerSession(validInput, {
        getConnection: async () => mock.connection,
      }),
    (error: unknown) =>
      error instanceof FinishTrainerSessionError && error.code === "not_found",
  );
  assert.ok(mock.isRolledBack());
  assert.equal(
    mock.calls.filter((c) => c.sql.includes("UPDATE task_sessions")).length,
    0,
  );
});

test("returns the stored summary without UPDATE when already completed", async () => {
  const mock = makeConnection({
    session: makeSession({
      session_status: SESSION_STATUS_COMPLETED,
      right_number: 8,
      tasks_number: 10,
      time: 42,
      start_time: 1_700_000_000,
    }),
    statuses: [TASK_STATUS_CORRECT],
  });

  const result = await finishTrainerSession(validInput, {
    getConnection: async () => mock.connection,
    nowSec: () => 1_700_000_999,
  });

  assert.deepEqual(result, {
    sessionId: 5,
    rightNumber: 8,
    tasksNumber: 10,
    percent: 80,
    timeSec: 42,
    themeId: 3,
    themeCode: "GEO-07-ELEM-PLAN",
    themeName: "Відмінювання",
  });
  assert.equal(
    mock.calls.filter((c) => c.sql.includes("UPDATE task_sessions")).length,
    0,
  );
  assert.equal(
    mock.calls.filter((c) => c.sql.includes("FROM tasks2session")).length,
    0,
  );
  assert.ok(mock.isCommitted());
  assert.ok(!mock.isRolledBack());
});

test("persists at least 1 second when start_time was never marked", async () => {
  const mock = makeConnection({
    session: makeSession({ start_time: 0 }),
    statuses: [TASK_STATUS_CORRECT],
  });
  const now = 1_700_000_500;

  const result = await finishTrainerSession(validInput, {
    getConnection: async () => mock.connection,
    nowSec: () => now,
  });

  assert.equal(result.timeSec, 1);
  const update = mock.calls.find((c) => c.sql.includes("UPDATE task_sessions"));
  assert.ok(update);
  assert.deepEqual(update!.params, [
    1,
    1,
    SESSION_STATUS_COMPLETED,
    1,
    now,
    5,
  ]);
});
