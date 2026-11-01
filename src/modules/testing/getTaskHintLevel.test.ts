import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { SESSION_STATUS_COMPLETED, SESSION_STATUS_CREATED } from "@/modules/sessions/types";
import { getTaskHintLevel, GetTaskHintLevelError } from "./getTaskHintLevel";
import { TASK_STATUS_CORRECT, TASK_STATUS_INCORRECT } from "./types";

type HintRow = {
  status: number;
  task_type: number;
  hint_level_unlocked: number;
  retry_used: number;
  session_type: number;
  session_status: number;
  expire_time: number;
  hint_direction: string | null;
  hint_rule: string | null;
  hint_example?: string | null;
  comments: string | null;
};

/** `retry_used: 1` by default in these tests — most of them exercise the
 * ladder once the retry is already spent (the common real-world case: a
 * student typically reads the full explanation after the task has locked).
 * Tests that specifically exercise the answer-leakage gate override this to
 * `0` (retry still pending). */
function makeRow(overrides: Partial<HintRow> = {}): HintRow {
  return {
    status: TASK_STATUS_INCORRECT,
    task_type: 1,
    hint_level_unlocked: 0,
    retry_used: 1,
    session_type: 1,
    session_status: SESSION_STATUS_CREATED,
    expire_time: 9_999_999_999,
    hint_direction: "Look at the sign of the coefficient.",
    hint_rule: "Rule: flip the inequality when multiplying by a negative.",
    comments: "Full worked example: ...",
    ...overrides,
  };
}

function makeConnection(rows: HintRow[]) {
  const row = { ...rows[0] };
  const hasRow = rows.length > 0;
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  let committed = false;
  let rolledBack = false;

  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>(sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return (hasRow ? [row] : []) as unknown as T[];
    },
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("hint_level_unlocked")) {
        const [level] = params as number[];
        row.hint_level_unlocked = level;
      }
      return { insertId: 0, affectedRows: 1 };
    },
    commit: async () => {
      committed = true;
    },
    rollback: async () => {
      rolledBack = true;
    },
    release: () => {},
  };

  return { connection, row, calls, isCommitted: () => committed, isRolledBack: () => rolledBack };
}

const validInput = { userId: 1, sessionId: 5, mappingId: 10, level: 1 as const };

test("level 1 returns the direction rung and unlocks it", async () => {
  const mock = makeConnection([makeRow()]);
  const result = await getTaskHintLevel(validInput, {
    getConnection: async () => mock.connection,
  });
  assert.deepEqual(result, {
    available: true,
    level: 1,
    text: "Look at the sign of the coefficient.",
    isFinal: false,
  });
  assert.equal(mock.row.hint_level_unlocked, 1);
  assert.ok(mock.isCommitted());
});

test("level 3 is rejected before level 1/2 were requested (no skipping ahead)", async () => {
  const mock = makeConnection([makeRow()]);
  await assert.rejects(
    () =>
      getTaskHintLevel(
        { ...validInput, level: 3 },
        { getConnection: async () => mock.connection },
      ),
    (error: unknown) =>
      error instanceof GetTaskHintLevelError && error.code === "not_eligible",
  );
  assert.ok(mock.isRolledBack());
});

test("rungs unlock sequentially: 1 then 2 then 3", async () => {
  const mock = makeConnection([makeRow()]);
  const r1 = await getTaskHintLevel(validInput, { getConnection: async () => mock.connection });
  assert.equal(r1.level, 1);
  const r2 = await getTaskHintLevel(
    { ...validInput, level: 2 },
    { getConnection: async () => mock.connection },
  );
  assert.equal(r2.text, "Rule: flip the inequality when multiplying by a negative.");
  assert.equal(r2.isFinal, false);
  const r3 = await getTaskHintLevel(
    { ...validInput, level: 3 },
    { getConnection: async () => mock.connection },
  );
  assert.equal(r3.text, "Full worked example: ...");
  assert.equal(r3.isFinal, true);
});

test("rung 3 (the answer-revealing explanation) is NOT available while the retry is still pending — prevents reading the answer instead of using the second attempt", async () => {
  const mock = makeConnection([makeRow({ retry_used: 0, hint_level_unlocked: 2 })]);
  const result = await getTaskHintLevel(
    { ...validInput, level: 3 },
    { getConnection: async () => mock.connection },
  );
  assert.deepEqual(result, { available: false, level: null, text: null, isFinal: false });
  // hint_level_unlocked must not silently advance on a gated/unavailable rung.
  assert.equal(mock.row.hint_level_unlocked, 2);
});

test("rungs 1 and 2 (direction/rule) stay available while the retry is pending — they never contain the answer", async () => {
  const mock = makeConnection([makeRow({ retry_used: 0 })]);
  const r1 = await getTaskHintLevel(validInput, { getConnection: async () => mock.connection });
  assert.equal(r1.available, true);
  assert.equal(r1.text, "Look at the sign of the coefficient.");
  const r2 = await getTaskHintLevel(
    { ...validInput, level: 2 },
    { getConnection: async () => mock.connection },
  );
  assert.equal(r2.available, true);
  assert.equal(r2.text, "Rule: flip the inequality when multiplying by a negative.");
});

test("rung 3 unlocks once the retry has been consumed", async () => {
  const mock = makeConnection([makeRow({ retry_used: 1, hint_level_unlocked: 2 })]);
  const result = await getTaskHintLevel(
    { ...validInput, level: 3 },
    { getConnection: async () => mock.connection },
  );
  assert.deepEqual(result, {
    available: true,
    level: 3,
    text: "Full worked example: ...",
    isFinal: true,
  });
});

test("a legacy task with only comments shows that hint on the first click, while the retry is still open", async () => {
  const mock = makeConnection([
    makeRow({ hint_direction: null, hint_rule: null, retry_used: 0 }),
  ]);
  const result = await getTaskHintLevel(validInput, {
    getConnection: async () => mock.connection,
  });
  assert.deepEqual(result, {
    available: true,
    level: 1,
    text: "Full worked example: ...",
    isFinal: true,
  });
  assert.equal(mock.row.hint_level_unlocked, 1);
});

test("a task missing the rule rung does not leak the explanation at level 2 while the retry is pending", async () => {
  const mock = makeConnection([makeRow({ hint_rule: null, retry_used: 0, hint_level_unlocked: 1 })]);
  const result = await getTaskHintLevel(
    { ...validInput, level: 2 },
    { getConnection: async () => mock.connection },
  );
  assert.deepEqual(result, { available: false, level: null, text: null, isFinal: false });
});

test("re-requesting an already-unlocked rung is idempotent, not rejected", async () => {
  const mock = makeConnection([makeRow({ hint_level_unlocked: 2 })]);
  const result = await getTaskHintLevel(
    { ...validInput, level: 1 },
    { getConnection: async () => mock.connection },
  );
  assert.equal(result.available, true);
  assert.equal(result.text, "Look at the sign of the coefficient.");
});

test("a legacy task with a blank comment stays unavailable instead of showing an empty hint", async () => {
  const mock = makeConnection([
    makeRow({
      hint_direction: null,
      hint_rule: null,
      comments: "   ",
      retry_used: 0,
    }),
  ]);
  const result = await getTaskHintLevel(validInput, {
    getConnection: async () => mock.connection,
  });
  assert.deepEqual(result, { available: false, level: null, text: null, isFinal: false });
  assert.equal(mock.row.hint_level_unlocked, 0);
});

test("legacy task without an authored ladder degrades straight to the explanation, marked final", async () => {
  const mock = makeConnection([
    makeRow({ hint_direction: null, hint_rule: null }),
  ]);
  const result = await getTaskHintLevel(validInput, {
    getConnection: async () => mock.connection,
  });
  assert.deepEqual(result, {
    available: true,
    level: 1,
    text: "Full worked example: ...",
    isFinal: true,
  });
});

test("a task missing the rule rung falls back to the explanation at level 2, marked final", async () => {
  const mock = makeConnection([makeRow({ hint_rule: null })]);
  await getTaskHintLevel(validInput, { getConnection: async () => mock.connection });
  const result = await getTaskHintLevel(
    { ...validInput, level: 2 },
    { getConnection: async () => mock.connection },
  );
  assert.equal(result.text, "Full worked example: ...");
  assert.equal(result.isFinal, true);
});

test("not eligible for a correct or unanswered task — never available", async () => {
  const mock = makeConnection([makeRow({ status: TASK_STATUS_CORRECT })]);
  const result = await getTaskHintLevel(validInput, {
    getConnection: async () => mock.connection,
  });
  assert.deepEqual(result, { available: false, level: null, text: null, isFinal: false });
});

test("not eligible for diagnostic (5) or NMT (4) sessions", async () => {
  for (const sessionType of [4, 5]) {
    const mock = makeConnection([makeRow({ session_type: sessionType })]);
    const result = await getTaskHintLevel(validInput, {
      getConnection: async () => mock.connection,
    });
    assert.equal(result.available, false);
  }
});

test("not eligible for a non-topic (NMT bank) task", async () => {
  const mock = makeConnection([makeRow({ task_type: 4 })]);
  const result = await getTaskHintLevel(validInput, {
    getConnection: async () => mock.connection,
  });
  assert.equal(result.available, false);
});

test("rejects a mapping that does not belong to this session or user", async () => {
  const mock = makeConnection([]);
  await assert.rejects(
    () => getTaskHintLevel(validInput, { getConnection: async () => mock.connection }),
    (error: unknown) =>
      error instanceof GetTaskHintLevelError && error.code === "not_found",
  );
});

test("rejects once the active session's 24h deadline has passed", async () => {
  const now = 1_700_000_000;
  const mock = makeConnection([makeRow({ expire_time: now - 1 })]);
  await assert.rejects(
    () =>
      getTaskHintLevel(validInput, {
        getConnection: async () => mock.connection,
        nowSec: () => now,
      }),
    (error: unknown) =>
      error instanceof GetTaskHintLevelError && error.code === "session_expired",
  );
});

test("a completed session's hints stay readable regardless of expire_time", async () => {
  const now = 1_700_000_000;
  const mock = makeConnection([
    makeRow({ expire_time: now - 1, session_status: SESSION_STATUS_COMPLETED }),
  ]);
  const result = await getTaskHintLevel(validInput, {
    getConnection: async () => mock.connection,
    nowSec: () => now,
  });
  assert.equal(result.available, true);
});

test("rejects invalid input", async () => {
  const mock = makeConnection([makeRow()]);
  await assert.rejects(
    () =>
      getTaskHintLevel(
        { ...validInput, level: 4 as never },
        { getConnection: async () => mock.connection },
      ),
    (error: unknown) =>
      error instanceof GetTaskHintLevelError && error.code === "invalid_input",
  );
});

test("analogous example is available before retry and distinct from revealed explanation", async () => {
  const mock = makeConnection([makeRow({ retry_used: 0, hint_level_unlocked: 2, hint_example: "Other equation: 2z=18, z=9." })]);
  const result = await getTaskHintLevel({ ...validInput, level: 3 }, { getConnection: async () => mock.connection });
  assert.deepEqual(result, { available: true, level: 3, text: "Other equation: 2z=18, z=9.", isFinal: true });
  assert.equal(mock.row.hint_level_unlocked, 3);
});
