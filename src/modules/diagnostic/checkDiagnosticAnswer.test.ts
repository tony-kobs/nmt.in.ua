import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { SESSION_STATUS_COMPLETED, SESSION_STATUS_CREATED } from "@/modules/sessions/types";
import { TASK_STATUS_CORRECT, TASK_STATUS_INCORRECT, TASK_STATUS_UNANSWERED } from "@/modules/testing/types";
import {
  CheckDiagnosticAnswerError,
  checkDiagnosticAnswer,
  validateCheckDiagnosticAnswerInput,
} from "./checkDiagnosticAnswer";

type MappingRow = {
  id: number;
  session_id: number;
  status: number;
  right_answer_n: number;
  session_status: number;
  expire_time: number;
};

function makeRow(overrides: Partial<MappingRow> = {}): MappingRow {
  return {
    id: 10,
    session_id: 5,
    status: TASK_STATUS_UNANSWERED,
    right_answer_n: 2,
    session_status: SESSION_STATUS_CREATED,
    expire_time: 9_999_999_999,
    ...overrides,
  };
}

function makeConnection(options: { rows: MappingRow[]; failUpdate?: boolean }) {
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
        return { insertId: 0, affectedRows: options.failUpdate ? 0 : 1 };
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
  owner: { userId: 1, guestToken: null },
  sessionId: 5,
  mappingId: 10,
  answerNumber: 2 as const,
};

test("validateCheckDiagnosticAnswerInput rejects an invalid owner", () => {
  assert.throws(
    () =>
      validateCheckDiagnosticAnswerInput({
        ...validInput,
        owner: { userId: 1, guestToken: "guest-a" },
      }),
    (error: unknown) =>
      error instanceof CheckDiagnosticAnswerError && error.code === "invalid_input",
  );
});

test("validateCheckDiagnosticAnswerInput rejects answers outside 1-4", () => {
  assert.throws(
    () => validateCheckDiagnosticAnswerInput({ ...validInput, answerNumber: 5 }),
    (error: unknown) =>
      error instanceof CheckDiagnosticAnswerError && error.code === "invalid_input",
  );
});

test("marks a matching option as correct for an authenticated owner", async () => {
  const mock = makeConnection({ rows: [makeRow()] });
  const result = await checkDiagnosticAnswer(validInput, {
    getConnection: async () => mock.connection,
  });
  assert.deepEqual(result, { correct: true });

  const select = mock.calls.find((c) => c.sql.includes("FROM tasks2session"));
  assert.match(select!.sql, /session_type = 5/);
  // mappingId, sessionId, then the 4 owner params (userId, userId, guestToken, guestToken)
  assert.deepEqual(select!.params, [10, 5, 1, 1, null, null]);
  assert.ok(mock.isCommitted());
});

test("marks a matching option as correct for a guest owner", async () => {
  const mock = makeConnection({ rows: [makeRow()] });
  const result = await checkDiagnosticAnswer(
    { ...validInput, owner: { userId: null, guestToken: "guest-a" } },
    { getConnection: async () => mock.connection },
  );
  assert.deepEqual(result, { correct: true });

  const select = mock.calls.find((c) => c.sql.includes("FROM tasks2session"));
  assert.deepEqual(select!.params, [10, 5, null, null, "guest-a", "guest-a"]);
});

test("guest A's owner params never match guest B's row (query returns nothing)", async () => {
  // The real SQL's WHERE would exclude a row owned by a different guest -
  // simulated here by the mock returning no rows for guest A's params.
  const mock = makeConnection({ rows: [] });
  await assert.rejects(
    () =>
      checkDiagnosticAnswer(
        { ...validInput, owner: { userId: null, guestToken: "guest-a" } },
        { getConnection: async () => mock.connection },
      ),
    (error: unknown) =>
      error instanceof CheckDiagnosticAnswerError && error.code === "not_found",
  );
});

test("marks a wrong option as incorrect", async () => {
  const mock = makeConnection({ rows: [makeRow()] });
  const result = await checkDiagnosticAnswer(
    { ...validInput, answerNumber: 1 },
    { getConnection: async () => mock.connection },
  );
  assert.deepEqual(result, { correct: false });
  const update = mock.calls.find((c) => c.sql.startsWith("UPDATE tasks2session"));
  assert.deepEqual(update!.params, [TASK_STATUS_INCORRECT, 10]);
});

test("returns the previous result without UPDATE when already answered", async () => {
  const mock = makeConnection({ rows: [makeRow({ status: TASK_STATUS_CORRECT })] });
  const result = await checkDiagnosticAnswer(validInput, {
    getConnection: async () => mock.connection,
  });
  assert.deepEqual(result, { correct: true });
  assert.equal(mock.calls.filter((c) => c.sql.startsWith("UPDATE")).length, 0);
});

test("rejects an unanswered task in a completed session", async () => {
  const mock = makeConnection({
    rows: [makeRow({ session_status: SESSION_STATUS_COMPLETED })],
  });
  await assert.rejects(
    () =>
      checkDiagnosticAnswer(validInput, {
        getConnection: async () => mock.connection,
      }),
    (error: unknown) =>
      error instanceof CheckDiagnosticAnswerError &&
      error.code === "session_completed",
  );
  assert.ok(mock.isRolledBack());
});

test("rejects an unanswered task once the session's 24h deadline has passed", async () => {
  const now = 1_700_000_000;
  const mock = makeConnection({ rows: [makeRow({ expire_time: now - 1 })] });

  await assert.rejects(
    () =>
      checkDiagnosticAnswer(validInput, {
        getConnection: async () => mock.connection,
        nowSec: () => now,
      }),
    (error: unknown) =>
      error instanceof CheckDiagnosticAnswerError &&
      error.code === "session_expired",
  );
  assert.ok(mock.isRolledBack());
});

test("still returns an already-recorded result once expired (read-only retry)", async () => {
  const now = 1_700_000_000;
  const mock = makeConnection({
    rows: [makeRow({ status: TASK_STATUS_CORRECT, expire_time: now - 1 })],
  });

  const result = await checkDiagnosticAnswer(validInput, {
    getConnection: async () => mock.connection,
    nowSec: () => now,
  });

  assert.deepEqual(result, { correct: true });
  assert.ok(mock.isCommitted());
});
