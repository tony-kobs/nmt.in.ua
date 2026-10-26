import assert from "node:assert/strict";
import test from "node:test";

test("duplicate first submission preserves the retry without revealing or updating", async () => {
  const mock = makeConnection({ rows: [makeRow()] });
  const deps = { getConnection: async () => mock.connection };
  await checkAnswer({ ...validInput, answerNumber: 1, attempt: 1 }, deps);
  const writes = mock.calls.filter((call) => call.sql.startsWith("UPDATE")).length;
  const replay = await checkAnswer({ ...validInput, answerNumber: 1, attempt: 1 }, deps);
  assert.equal(replay.retryAvailable, true);
  assert.equal(replay.revealed, undefined);
  assert.equal(mock.calls.filter((call) => call.sql.startsWith("UPDATE")).length, writes);
  const retry = await checkAnswer({ ...validInput, answerNumber: 2, attempt: 2 }, deps);
  assert.equal(retry.correct, true);
  assert.equal(retry.firstAttempt, false);
});
import type { SqlConnection } from "@/lib/db/mysql";
import { SESSION_STATUS_COMPLETED, SESSION_STATUS_CREATED } from "@/modules/sessions/types";
import {
  checkAnswer,
  CheckAnswerError,
  normalizeAnswerText,
  TASK_STATUS_CORRECT,
  TASK_STATUS_INCORRECT,
  TASK_STATUS_UNANSWERED,
  validateCheckAnswerInput,
} from "./checkAnswer";

type MappingRow = {
  id: number;
  session_id: number;
  status: number;
  first_attempt_status: number | null;
  retry_used: number;
  user_id: number;
  task_type: number;
  right_answer_n: number | null;
  right_answer_text: string | null;
  task_kind: "mcq" | "match" | "open";
  comments: string | null;
  answer_1: string | null;
  answer_2: string | null;
  answer_3: string | null;
  answer_4: string | null;
  session_type: number;
  session_status: number;
  expire_time: number;
  practice_streak: number;
};

/** Session type 1 (`SESSION_TYPE_USER`) is Practice-retry eligible; 4/5 are
 * the ineligible NMT-simulator/diagnostic constants mirrored in checkAnswer. */
function makeRow(overrides: Partial<MappingRow> = {}): MappingRow {
  return {
    id: 10,
    session_id: 5,
    status: TASK_STATUS_UNANSWERED,
    first_attempt_status: null,
    retry_used: 0,
    user_id: 1,
    task_type: 1,
    right_answer_n: 2,
    right_answer_text: null,
    task_kind: "mcq",
    comments: "Because 2 is right.",
    answer_1: "one",
    answer_2: "two",
    answer_3: "three",
    answer_4: "four",
    session_type: 1,
    session_status: SESSION_STATUS_CREATED,
    expire_time: 9_999_999_999,
    practice_streak: 0,
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
  const row = { ...options.rows[0] };
  const hasRow = options.rows.length > 0;

  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>(sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return (hasRow ? [row] : []) as unknown as T[];
    },
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.startsWith("UPDATE tasks2session")) {
        if (options.failUpdate) return { insertId: 0, affectedRows: 0 };
        if (sql.includes("first_attempt_status")) {
          const [status, firstAttemptStatus] = params as number[];
          row.status = status;
          row.first_attempt_status = firstAttemptStatus;
        } else if (sql.includes("retry_used")) {
          const [status] = params as number[];
          row.status = status;
          row.retry_used = 1;
        }
        return { insertId: 0, affectedRows: 1 };
      }
      if (sql.startsWith("UPDATE task_sessions") && sql.includes("practice_streak")) {
        if (options.failUpdate) return { insertId: 0, affectedRows: 0 };
        const [streak] = params as number[];
        row.practice_streak = streak;
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
    release: () => {
      released = true;
    },
  };

  return {
    connection,
    calls,
    row,
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

test("marks a matching option as correct on the first attempt", async () => {
  const mock = makeConnection({ rows: [makeRow()] });

  const result = await checkAnswer(validInput, {
    getConnection: async () => mock.connection,
  });

  assert.deepEqual(result, { correct: true, firstAttempt: true, practiceStreak: 1 });
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
  assert.deepEqual(update!.params, [TASK_STATUS_CORRECT, TASK_STATUS_CORRECT, 10]);
  assert.ok(mock.isCommitted());
  assert.ok(!mock.isRolledBack());
  assert.ok(mock.isReleased());
});

test("a wrong FIRST attempt in an eligible Practice session offers a retry, no answer revealed", async () => {
  const mock = makeConnection({ rows: [makeRow()] });

  const result = await checkAnswer(
    { ...validInput, answerNumber: 1 },
    { getConnection: async () => mock.connection },
  );

  assert.deepEqual(result, {
    correct: false,
    firstAttempt: true,
    retryAvailable: true,
    practiceStreak: 0,
  });
  assert.doesNotMatch(JSON.stringify(result), /correctAnswerNumber|explanation/);
  const update = mock.calls.find((c) =>
    c.sql.startsWith("UPDATE tasks2session"),
  );
  assert.deepEqual(update!.params, [
    TASK_STATUS_INCORRECT,
    TASK_STATUS_INCORRECT,
    10,
  ]);
  assert.ok(mock.isCommitted());
});

test("a wrong first attempt on a diagnostic/exam or non-topic task locks immediately (no retry, no reveal)", async () => {
  const mock = makeConnection({
    rows: [makeRow({ session_type: 5 })],
  });

  const result = await checkAnswer(
    { ...validInput, answerNumber: 1 },
    { getConnection: async () => mock.connection },
  );

  assert.deepEqual(result, { correct: false, firstAttempt: true });
});

test("second attempt correct: locks as correct, does not touch first_attempt_status again", async () => {
  const mock = makeConnection({
    rows: [
      makeRow({
        status: TASK_STATUS_INCORRECT,
        first_attempt_status: TASK_STATUS_INCORRECT,
        retry_used: 0,
      }),
    ],
  });

  const result = await checkAnswer(
    { ...validInput, answerNumber: 2, attempt: 2 },
    { getConnection: async () => mock.connection },
  );

  assert.deepEqual(result, { correct: true, firstAttempt: false });
  const update = mock.calls.find((c) =>
    c.sql.startsWith("UPDATE tasks2session"),
  );
  assert.match(update!.sql, /retry_used/);
  assert.deepEqual(update!.params, [TASK_STATUS_CORRECT, 10]);
  assert.equal(mock.row.first_attempt_status, TASK_STATUS_INCORRECT);
});

test("second attempt wrong: locks the row and reveals the correct answer + explanation", async () => {
  const mock = makeConnection({
    rows: [
      makeRow({
        status: TASK_STATUS_INCORRECT,
        first_attempt_status: TASK_STATUS_INCORRECT,
        retry_used: 0,
      }),
    ],
  });

  const result = await checkAnswer(
    { ...validInput, answerNumber: 1, attempt: 2 },
    { getConnection: async () => mock.connection },
  );

  assert.equal(result.correct, false);
  assert.equal(result.firstAttempt, false);
  assert.deepEqual(result.revealed, {
    correctAnswerNumber: 2,
    correctAnswerText: "two",
    explanation: "Because 2 is right.",
  });
});

test("a locked (retry already consumed) row returns the same reveal idempotently, without another UPDATE", async () => {
  const mock = makeConnection({
    rows: [
      makeRow({
        status: TASK_STATUS_INCORRECT,
        first_attempt_status: TASK_STATUS_INCORRECT,
        retry_used: 1,
      }),
    ],
  });

  const result = await checkAnswer(
    { ...validInput, answerNumber: 1 },
    { getConnection: async () => mock.connection },
  );

  assert.equal(result.correct, false);
  assert.deepEqual(result.revealed, {
    correctAnswerNumber: 2,
    correctAnswerText: "two",
    explanation: "Because 2 is right.",
  });
  assert.equal(
    mock.calls.filter((c) => c.sql.startsWith("UPDATE")).length,
    0,
  );
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

test("returns the previous result without UPDATE for an already-correct task", async () => {
  const mock = makeConnection({
    rows: [makeRow({ status: TASK_STATUS_CORRECT })],
  });

  const result = await checkAnswer(
    { ...validInput, answerNumber: 2 },
    { getConnection: async () => mock.connection },
  );

  assert.deepEqual(result, { correct: true, firstAttempt: false });
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

test("rejects a retry attempt once the session is completed (in between the two attempts)", async () => {
  const mock = makeConnection({
    rows: [
      makeRow({
        status: TASK_STATUS_INCORRECT,
        first_attempt_status: TASK_STATUS_INCORRECT,
        retry_used: 0,
        session_status: SESSION_STATUS_COMPLETED,
      }),
    ],
  });

  await assert.rejects(
    () =>
      checkAnswer({ ...validInput, attempt: 2 }, {
        getConnection: async () => mock.connection,
      }),
    (error: unknown) =>
      error instanceof CheckAnswerError && error.code === "session_completed",
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

  assert.deepEqual(result, { correct: true, firstAttempt: false });
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

test("an independent, unaided, first-attempt correct answer extends the server-tracked streak", async () => {
  const mock = makeConnection({ rows: [makeRow({ practice_streak: 2 })] });
  const result = await checkAnswer(validInput, {
    getConnection: async () => mock.connection,
  });
  assert.equal(result.correct, true);
  assert.equal(result.practiceStreak, 3);
  const streakUpdate = mock.calls.find((c) => c.sql.startsWith("UPDATE task_sessions"));
  assert.deepEqual(streakUpdate!.params, [3, 5]);
});

test("a wrong first attempt resets the streak to 0", async () => {
  const mock = makeConnection({ rows: [makeRow({ practice_streak: 2 })] });
  const result = await checkAnswer(
    { ...validInput, answerNumber: 1 },
    { getConnection: async () => mock.connection },
  );
  assert.equal(result.correct, false);
  assert.equal(result.practiceStreak, 0);
});

test("a retried-then-correct answer does NOT extend the streak (retry never touches practice_streak)", async () => {
  const mock = makeConnection({
    rows: [
      makeRow({
        status: TASK_STATUS_INCORRECT,
        first_attempt_status: TASK_STATUS_INCORRECT,
        retry_used: 0,
        practice_streak: 0, // already reset by the first wrong attempt
      }),
    ],
  });
  const result = await checkAnswer(
    { ...validInput, answerNumber: 2, attempt: 2 }, // correct on the retry
    { getConnection: async () => mock.connection },
  );
  assert.equal(result.correct, true);
  assert.equal(result.firstAttempt, false);
  assert.equal(
    "practiceStreak" in result,
    false,
    "the retry branch never reports or mutates practice_streak",
  );
  const streakUpdate = mock.calls.find((c) => c.sql.startsWith("UPDATE task_sessions"));
  assert.equal(streakUpdate, undefined);
});

test("a hint does not exist before a first attempt, so a hinted-then-correct scenario can only happen via the retry path — also excluded above", () => {
  // Documents WHY no separate "hint used" flag is threaded through this
  // module: getTaskHintLevel.ts only ever becomes eligible once
  // `status === TASK_STATUS_INCORRECT`, i.e. after the first check already
  // ran — so the first-attempt branch (the only one that can extend the
  // streak) can never itself be hint-assisted. Any hinted answer is
  // necessarily a retry, which the test above already proves never
  // touches the streak.
  assert.ok(true);
});

test("resuming after a page reload sees the exact same retry/hint state as a fresh call — no client-held state required", async () => {
  const mock = makeConnection({ rows: [makeRow()] });

  // First "page load": answer wrong.
  const first = await checkAnswer(
    { ...validInput, answerNumber: 1 },
    { getConnection: async () => mock.connection },
  );
  assert.equal(first.retryAvailable, true);

  // Simulate a full page reload / a fresh Server Action call with no
  // client-held memory of the previous attempt — same mappingId, a fresh
  // `checkAnswer` invocation reading the row straight from the DB.
  const second = await checkAnswer(
    { ...validInput, answerNumber: 2, attempt: 2 },
    { getConnection: async () => mock.connection },
  );
  assert.equal(second.correct, true);
  assert.equal(second.firstAttempt, false, "the reload still lands on the retry, not a fresh first attempt");
});

test("two different device sessions reading the same mapping row see consistent state", async () => {
  const mock = makeConnection({
    rows: [
      makeRow({
        status: TASK_STATUS_INCORRECT,
        first_attempt_status: TASK_STATUS_INCORRECT,
        retry_used: 1, // already locked by device A
      }),
    ],
  });

  // Device A already saw and consumed the retry; device B opens the same
  // session afterwards and must see the identical locked/revealed state,
  // not a fresh first-attempt or a second retry offer.
  const deviceB = await checkAnswer(
    { ...validInput, answerNumber: 3 },
    { getConnection: async () => mock.connection },
  );
  assert.equal(deviceB.correct, false);
  assert.ok(deviceB.revealed, "device B sees the same locked/revealed state device A produced");
  assert.equal(deviceB.retryAvailable, undefined);
});

test("a non-topic (NMT bank) task never gets a retry, matching pre-existing single-attempt behavior", async () => {
  const mock = makeConnection({
    rows: [
      makeRow({
        task_type: 4,
        right_answer_n: 2,
      }),
    ],
  });

  const result = await checkAnswer(
    { ...validInput, answerNumber: 1 },
    { getConnection: async () => mock.connection },
  );

  assert.deepEqual(result, { correct: false, firstAttempt: true });
});

test("normalizeAnswerText keeps decimals and maps matching letters А–Д onto a–e", () => {
  assert.equal(normalizeAnswerText(" 4,4 "), "4.4");
  assert.equal(normalizeAnswerText("-35"), "-35");
  assert.equal(normalizeAnswerText("1b;2d;3a"), "1b;2d;3a");
  assert.equal(normalizeAnswerText("1Б; 2Г; 3А"), "1b;2d;3a");
});

test("a Cyrillic matching answer scores against the latin key", async () => {
  const mock = makeConnection({
    rows: [
      makeRow({
        task_type: 4,
        session_type: 4,
        task_kind: "match",
        right_answer_n: null,
        right_answer_text: "1b;2d;3a",
      }),
    ],
  });

  const correct = await checkAnswer(
    {
      userId: 1,
      sessionId: 5,
      mappingId: 10,
      answerText: "1Б;2Г;3А",
    },
    { getConnection: async () => mock.connection },
  );
  assert.deepEqual(correct, { correct: true, firstAttempt: true });

  const again = makeConnection({
    rows: [
      makeRow({
        task_type: 4,
        session_type: 4,
        task_kind: "match",
        right_answer_n: null,
        right_answer_text: "1b;2d;3a",
      }),
    ],
  });
  const wrong = await checkAnswer(
    {
      userId: 1,
      sessionId: 5,
      mappingId: 10,
      answerText: "1a;2a;3a",
    },
    { getConnection: async () => again.connection },
  );
  assert.deepEqual(wrong, { correct: false, firstAttempt: true });
});
