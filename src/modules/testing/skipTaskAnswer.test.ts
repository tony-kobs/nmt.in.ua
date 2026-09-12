import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { SESSION_STATUS_COMPLETED, SESSION_STATUS_CREATED } from "@/modules/sessions/types";
import {
  skipTaskAnswer,
  SkipTaskAnswerError,
  validateSkipTaskAnswerInput,
} from "./skipTaskAnswer";
import { TASK_STATUS_INCORRECT, TASK_STATUS_UNANSWERED } from "./types";

type MappingRow = {
  id: number;
  status: number;
  session_status: number;
  expire_time: number;
};

function makeRow(overrides: Partial<MappingRow> = {}): MappingRow {
  return {
    id: 10,
    status: TASK_STATUS_UNANSWERED,
    session_status: SESSION_STATUS_CREATED,
    expire_time: 9_999_999_999,
    ...overrides,
  };
}

function makeConnection(rows: MappingRow[]) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  let rolledBack = false;
  let committed = false;

  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>(sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return rows as unknown as T[];
    },
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.startsWith("UPDATE tasks2session")) {
        return { insertId: 0, affectedRows: 1 };
      }
      return { insertId: 0, affectedRows: 0 };
    },
    commit: async () => {
      committed = true;
    },
    rollback: async () => {
      rolledBack = true;
    },
    release: () => {},
  };

  return { connection, calls, isCommitted: () => committed, isRolledBack: () => rolledBack };
}

const validInput = { userId: 1, sessionId: 5, mappingId: 10 };

test("validateSkipTaskAnswerInput rejects non-positive ids", () => {
  assert.throws(
    () => validateSkipTaskAnswerInput({ ...validInput, mappingId: 0 }),
    (error: unknown) =>
      error instanceof SkipTaskAnswerError && error.code === "invalid_input",
  );
});

test("marks an unanswered task as incorrect", async () => {
  const mock = makeConnection([makeRow()]);

  const result = await skipTaskAnswer(validInput, {
    getConnection: async () => mock.connection,
  });

  assert.deepEqual(result, { correct: false });
  const update = mock.calls.find((c) => c.sql.startsWith("UPDATE tasks2session"));
  assert.deepEqual(update?.params, [TASK_STATUS_INCORRECT, 10]);
  assert.ok(mock.isCommitted());
});

test("rejects a mapping not found for this session/user", async () => {
  const mock = makeConnection([]);

  await assert.rejects(
    () => skipTaskAnswer(validInput, { getConnection: async () => mock.connection }),
    (error: unknown) =>
      error instanceof SkipTaskAnswerError && error.code === "not_found",
  );
});

test("rejects skipping in a completed session", async () => {
  const mock = makeConnection([makeRow({ session_status: SESSION_STATUS_COMPLETED })]);

  await assert.rejects(
    () => skipTaskAnswer(validInput, { getConnection: async () => mock.connection }),
    (error: unknown) =>
      error instanceof SkipTaskAnswerError && error.code === "session_completed",
  );
});

test("rejects skipping once the session's 24h deadline has passed", async () => {
  const now = 1_700_000_000;
  const mock = makeConnection([makeRow({ expire_time: now - 1 })]);

  await assert.rejects(
    () =>
      skipTaskAnswer(validInput, {
        getConnection: async () => mock.connection,
        nowSec: () => now,
      }),
    (error: unknown) =>
      error instanceof SkipTaskAnswerError && error.code === "session_expired",
  );
  assert.ok(mock.isRolledBack());
});

test("still returns the previous result for an already-skipped task once expired (read-only retry)", async () => {
  const now = 1_700_000_000;
  const mock = makeConnection([
    makeRow({ status: TASK_STATUS_INCORRECT, expire_time: now - 1 }),
  ]);

  const result = await skipTaskAnswer(validInput, {
    getConnection: async () => mock.connection,
    nowSec: () => now,
  });

  assert.deepEqual(result, { correct: false });
  assert.ok(mock.isCommitted());
});
