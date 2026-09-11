import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { getTaskHint, GetTaskHintError } from "./getTaskHint";
import { TASK_STATUS_CORRECT, TASK_STATUS_INCORRECT, TASK_STATUS_UNANSWERED } from "./types";

type HintRow = {
  status: number;
  task_type: number;
  session_type: number;
  comments: string | null;
};

function makeRow(overrides: Partial<HintRow> = {}): HintRow {
  return {
    status: TASK_STATUS_INCORRECT,
    task_type: 1,
    session_type: 1,
    comments: "Because x = 2 solves the equation.",
    ...overrides,
  };
}

function makeConnection(rows: HintRow[]) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  let released = false;
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>(sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return rows as unknown as T[];
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

const validInput = { userId: 1, sessionId: 5, mappingId: 10 };

test("validates positive integer input", async () => {
  await assert.rejects(
    () =>
      getTaskHint(
        { ...validInput, sessionId: 0 },
        { getConnection: async () => makeConnection([]).connection },
      ),
    (error: unknown) => error instanceof GetTaskHintError && error.code === "invalid_input",
  );
});

test("returns the comment as an available hint after an incorrect answer", async () => {
  const mock = makeConnection([makeRow()]);
  const result = await getTaskHint(validInput, {
    getConnection: async () => mock.connection,
  });
  assert.deepEqual(result, {
    available: true,
    hint: "Because x = 2 solves the equation.",
  });
  assert.deepEqual(mock.calls[0]!.params, [10, 5, 1]);
  assert.ok(mock.isReleased());
});

test("is never available before the task was answered incorrectly", async () => {
  const correct = await getTaskHint(validInput, {
    getConnection: async () =>
      makeConnection([makeRow({ status: TASK_STATUS_CORRECT })]).connection,
  });
  assert.deepEqual(correct, { available: false, hint: null });

  const unanswered = await getTaskHint(validInput, {
    getConnection: async () =>
      makeConnection([makeRow({ status: TASK_STATUS_UNANSWERED })]).connection,
  });
  assert.deepEqual(unanswered, { available: false, hint: null });
});

test("is never available for diagnostic (5) or NMT (4) sessions", async () => {
  for (const sessionType of [4, 5]) {
    const result = await getTaskHint(validInput, {
      getConnection: async () =>
        makeConnection([makeRow({ session_type: sessionType })]).connection,
    });
    assert.deepEqual(result, { available: false, hint: null });
  }
});

test("handles a task imported without comments by reporting unavailable, not empty text", async () => {
  const mock = makeConnection([makeRow({ comments: "" })]);
  const result = await getTaskHint(validInput, {
    getConnection: async () => mock.connection,
  });
  assert.deepEqual(result, { available: false, hint: null });

  const mockNull = makeConnection([makeRow({ comments: null })]);
  const resultNull = await getTaskHint(validInput, {
    getConnection: async () => mockNull.connection,
  });
  assert.deepEqual(resultNull, { available: false, hint: null });
});

test("rejects a mapping that does not belong to this session or user", async () => {
  const mock = makeConnection([]);
  await assert.rejects(
    () => getTaskHint(validInput, { getConnection: async () => mock.connection }),
    (error: unknown) => error instanceof GetTaskHintError && error.code === "not_found",
  );
});
