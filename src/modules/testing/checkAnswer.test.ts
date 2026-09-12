import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { SESSION_STATUS_COMPLETED, SESSION_STATUS_CREATED } from "@/modules/sessions/types";
import {
  checkAnswer,
  CheckAnswerError,
  TASK_STATUS_CORRECT,
  TASK_STATUS_INCORRECT,
  TASK_STATUS_UNANSWERED,
  validateCheckAnswerInput,
} from "./checkAnswer";

type MappingRow = {
  id: number;
  session_id: number;
  status: number;
  user_id: number;
  task_type: number;
  right_answer_n: number | null;
  right_answer_text: string | null;
  task_kind: "mcq" | "match" | "open";
  session_status: number;
  expire_time: number;
};

function makeRow(overrides: Partial<MappingRow> = {}): MappingRow {
  return {
    id: 10,
    session_id: 5,
    status: TASK_STATUS_UNANSWERED,
    user_id: 1,
    task_type: 1,
    right_answer_n: 2,
    right_answer_text: null,
    task_kind: "mcq",
    session_status: SESSION_STATUS_CREATED,
    expire_time: 9_999_999_999,
    ...overrides,
  };
}

function makeConnection(options: {
  rows: MappingRow[];
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
      return options.rows as unknown as T[];
    },
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.startsWith("UPDATE tasks2session")) {
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

const validInput = {
  userId: 1,
  sessionId: 5,
  mappingId: 10,
  answerNumber: 2 as const,
};

test("validateCheckAnswerInput rejects non-positive ids and answers outside 1–5", () => {
  assert.throws(
    () => validateCheckAnswerInput({ ...validInput, sessionId: 0 }),
    (error: unknown) =>
      error instanceof CheckAnswerError && error.code === "invalid_input",
  );
  assert.throws(
    () => validateCheckAnswerInput({ ...validInput, answerNumber: 6 }),
    (error: unknown) =>
      error instanceof CheckAnswerError && error.code === "invalid_input",
  );
  assert.throws(
    () => validateCheckAnswerInput({ ...validInput, mappingId: "10" }),
    (error: unknown) =>
      error instanceof CheckAnswerError && error.code === "invalid_input",
  );
});

test("marks a matching option as correct and writes status 1", async () => {
  const mock = makeConnection({ rows: [makeRow()] });

  const result = await checkAnswer(validInput, {
    getConnection: async () => mock.connection,
  });

  assert.deepEqual(result, { correct: true });
  assert.doesNotMatch(JSON.stringify(result), /right_answer_n/);

  const select = mock.calls.find((c) => c.sql.includes("FROM tasks2session"));
  assert.ok(select);
  assert.match(select!.sql, /qt\.right_answer_n/);
  assert.match(select!.sql, /FOR UPDATE/);
  assert.deepEqual(select!.params, [10, 5, 1]);

  const update = mock.calls.find((c) =>
    c.sql.startsWith("UPDATE tasks2session"),
  );
  assert.ok(update);
  assert.deepEqual(update!.params, [TASK_STATUS_CORRECT, 10]);
  assert.ok(mock.isCommitted());
  assert.ok(!mock.isRolledBack());
  assert.ok(mock.isReleased());
});

test("marks a wrong option as incorrect and writes status -1", async () => {
  const mock = makeConnection({ rows: [makeRow()] });

  const result = await checkAnswer(
    { ...validInput, answerNumber: 1 },
    { getConnection: async () => mock.connection },
  );

  assert.deepEqual(result, { correct: false });
  const update = mock.calls.find((c) =>
    c.sql.startsWith("UPDATE tasks2session"),
  );
  assert.deepEqual(update!.params, [TASK_STATUS_INCORRECT, 10]);
  assert.ok(mock.isCommitted());
});

test("rejects a mapping that does not belong to this session or user", async () => {
  const mock = makeConnection({ rows: [] });

  await assert.rejects(
    () =>
      checkAnswer(validInput, {
        getConnection: async () => mock.connection,
      }),
    (error: unknown) =>
      error instanceof CheckAnswerError && error.code === "not_found",
  );
  assert.ok(mock.isRolledBack());
  assert.ok(!mock.isCommitted());
  assert.equal(
    mock.calls.filter((c) => c.sql.startsWith("UPDATE")).length,
    0,
  );
});

test("returns the previous result without UPDATE when the task was already answered", async () => {
  const mock = makeConnection({
    rows: [makeRow({ status: TASK_STATUS_INCORRECT })],
  });

  const result = await checkAnswer(
    { ...validInput, answerNumber: 2 },
    { getConnection: async () => mock.connection },
  );

  assert.deepEqual(result, { correct: false });
  assert.equal(
    mock.calls.filter((c) => c.sql.startsWith("UPDATE")).length,
    0,
  );
  assert.ok(mock.isCommitted());
  assert.ok(!mock.isRolledBack());
});

test("rejects an unanswered task in a completed session", async () => {
  const mock = makeConnection({
    rows: [makeRow({ session_status: SESSION_STATUS_COMPLETED })],
  });

  await assert.rejects(
    () =>
      checkAnswer(validInput, {
        getConnection: async () => mock.connection,
      }),
    (error: unknown) =>
      error instanceof CheckAnswerError && error.code === "session_completed",
  );
  assert.ok(mock.isRolledBack());
  assert.equal(
    mock.calls.filter((c) => c.sql.startsWith("UPDATE")).length,
    0,
  );
});

test("rejects an unanswered task once the session's 24h deadline has passed", async () => {
  const now = 1_700_000_000;
  const mock = makeConnection({
    rows: [makeRow({ expire_time: now - 1 })],
  });

  await assert.rejects(
    () =>
      checkAnswer(validInput, {
        getConnection: async () => mock.connection,
        nowSec: () => now,
      }),
    (error: unknown) =>
      error instanceof CheckAnswerError && error.code === "session_expired",
  );
  assert.ok(mock.isRolledBack());
  assert.equal(
    mock.calls.filter((c) => c.sql.startsWith("UPDATE")).length,
    0,
  );
});

test("still returns an already-recorded result once the session has expired (read-only retry)", async () => {
  const now = 1_700_000_000;
  const mock = makeConnection({
    rows: [makeRow({ status: TASK_STATUS_CORRECT, expire_time: now - 1 })],
  });

  const result = await checkAnswer(validInput, {
    getConnection: async () => mock.connection,
    nowSec: () => now,
  });

  assert.deepEqual(result, { correct: true });
  assert.ok(mock.isCommitted());
});

test("session ownership wins over expiration — a foreign session is not_found, not session_expired", async () => {
  const now = 1_700_000_000;
  const mock = makeConnection({ rows: [] }); // WHERE ... AND user_id = ? matched nothing

  await assert.rejects(
    () =>
      checkAnswer(validInput, {
        getConnection: async () => mock.connection,
        nowSec: () => now,
      }),
    (error: unknown) =>
      error instanceof CheckAnswerError && error.code === "not_found",
  );
});
