import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import {
  RecordSelfScoreError,
  recordSelfScore,
  validateRecordSelfScoreInput,
} from "./recordSelfScore";

function makeConnection(options: { failInsert?: boolean } = {}) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async () => [],
    execute: async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.includes("CREATE TABLE")) {
        return { insertId: 0, affectedRows: 0 };
      }
      if (sql.includes("INSERT INTO user_self_scores")) {
        return { insertId: 42, affectedRows: options.failInsert ? 0 : 1 };
      }
      return { insertId: 0, affectedRows: 0 };
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };
  return { connection, calls };
}

test("validateRecordSelfScoreInput rejects a score of 0", () => {
  assert.throws(
    () =>
      validateRecordSelfScoreInput({
        userId: 1,
        guestToken: null,
        themeId: null,
        score: 0,
        source: "diagnostic_overall",
      }),
    (error: unknown) =>
      error instanceof RecordSelfScoreError && error.code === "invalid_input",
  );
});

test("validateRecordSelfScoreInput rejects a score of 11", () => {
  assert.throws(
    () =>
      validateRecordSelfScoreInput({
        userId: 1,
        guestToken: null,
        themeId: null,
        score: 11,
        source: "diagnostic_overall",
      }),
    (error: unknown) =>
      error instanceof RecordSelfScoreError && error.code === "invalid_input",
  );
});

test("validateRecordSelfScoreInput rejects a non-integer score", () => {
  assert.throws(
    () =>
      validateRecordSelfScoreInput({
        userId: 1,
        guestToken: null,
        themeId: null,
        score: 5.5,
        source: "diagnostic_overall",
      }),
    (error: unknown) =>
      error instanceof RecordSelfScoreError && error.code === "invalid_input",
  );
});

test("validateRecordSelfScoreInput accepts score 1 and score 10", () => {
  const low = validateRecordSelfScoreInput({
    userId: 1,
    guestToken: null,
    themeId: null,
    score: 1,
    source: "diagnostic_overall",
  });
  assert.equal(low.score, 1);

  const high = validateRecordSelfScoreInput({
    userId: null,
    guestToken: "guest-uuid",
    themeId: null,
    score: 10,
    source: "diagnostic_overall",
  });
  assert.equal(high.score, 10);
});

test("validateRecordSelfScoreInput rejects both userId and guestToken set", () => {
  assert.throws(
    () =>
      validateRecordSelfScoreInput({
        userId: 1,
        guestToken: "guest-uuid",
        themeId: null,
        score: 5,
        source: "diagnostic_overall",
      }),
    (error: unknown) =>
      error instanceof RecordSelfScoreError && error.code === "invalid_input",
  );
});

test("validateRecordSelfScoreInput rejects neither userId nor guestToken set", () => {
  assert.throws(
    () =>
      validateRecordSelfScoreInput({
        userId: null,
        guestToken: null,
        themeId: null,
        score: 5,
        source: "diagnostic_overall",
      }),
    (error: unknown) =>
      error instanceof RecordSelfScoreError && error.code === "invalid_input",
  );
});

test("validateRecordSelfScoreInput requires themeId for pre_topic", () => {
  assert.throws(
    () =>
      validateRecordSelfScoreInput({
        userId: 1,
        guestToken: null,
        themeId: null,
        score: 5,
        source: "pre_topic",
      }),
    (error: unknown) =>
      error instanceof RecordSelfScoreError && error.code === "invalid_input",
  );
});

test("recordSelfScore inserts a diagnostic_overall row for an authenticated user", async () => {
  const mock = makeConnection();
  const result = await recordSelfScore(
    {
      userId: 7,
      guestToken: null,
      themeId: null,
      score: 6,
      source: "diagnostic_overall",
    },
    { getConnection: async () => mock.connection },
  );

  assert.deepEqual(result, { id: 42 });
  const insert = mock.calls.find((c) =>
    c.sql.includes("INSERT INTO user_self_scores"),
  );
  assert.deepEqual(insert!.params, [7, null, null, 6, "diagnostic_overall"]);
});

test("recordSelfScore inserts a diagnostic_overall row for a guest", async () => {
  const mock = makeConnection();
  const result = await recordSelfScore(
    {
      userId: null,
      guestToken: "guest-uuid",
      themeId: null,
      score: 3,
      source: "diagnostic_overall",
    },
    { getConnection: async () => mock.connection },
  );

  assert.deepEqual(result, { id: 42 });
  const insert = mock.calls.find((c) =>
    c.sql.includes("INSERT INTO user_self_scores"),
  );
  assert.deepEqual(insert!.params, [
    null,
    "guest-uuid",
    null,
    3,
    "diagnostic_overall",
  ]);
});

test("recordSelfScore writes a new history row on every call, never overwriting", async () => {
  const mock = makeConnection();
  await recordSelfScore(
    { userId: 1, guestToken: null, themeId: 5, score: 4, source: "pre_topic" },
    { getConnection: async () => mock.connection },
  );
  await recordSelfScore(
    { userId: 1, guestToken: null, themeId: 5, score: 9, source: "pre_topic" },
    { getConnection: async () => mock.connection },
  );

  const inserts = mock.calls.filter((c) =>
    c.sql.includes("INSERT INTO user_self_scores"),
  );
  assert.equal(inserts.length, 2);
  assert.deepEqual(inserts[0]!.params, [1, null, 5, 4, "pre_topic"]);
  assert.deepEqual(inserts[1]!.params, [1, null, 5, 9, "pre_topic"]);
});
