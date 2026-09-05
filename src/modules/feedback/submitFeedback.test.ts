import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import {
  submitFeedback,
  SubmitFeedbackError,
  validateSubmitFeedbackInput,
} from "./submitFeedback";

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
      if (sql.includes("INSERT INTO site_feedback")) {
        return {
          insertId: 12,
          affectedRows: options.failInsert ? 0 : 1,
        };
      }
      return { insertId: 0, affectedRows: 0 };
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };
  return { connection, calls };
}

test("validateSubmitFeedbackInput requires a message when score is below 5", () => {
  assert.throws(
    () =>
      validateSubmitFeedbackInput({
        userId: null,
        sessionId: null,
        score: 4,
        message: "   ",
        email: null,
        source: "footer",
      }),
    (error: unknown) =>
      error instanceof SubmitFeedbackError &&
      error.code === "message_required",
  );
});

test("validateSubmitFeedbackInput allows an empty message for a score of 5 or above", () => {
  const input = validateSubmitFeedbackInput({
    userId: 1,
    sessionId: 38,
    score: 5,
    message: "",
    email: "ignored@example.com",
    source: "post_test",
  });
  assert.equal(input.message, null);
  assert.equal(input.email, null);
  assert.equal(input.userId, 1);
  assert.equal(input.sessionId, 38);

  const high = validateSubmitFeedbackInput({
    userId: 1,
    sessionId: null,
    score: 10,
    message: "",
    email: null,
    source: "footer",
  });
  assert.equal(high.score, 10);
  assert.equal(high.message, null);
});

test("validateSubmitFeedbackInput rejects a score outside 1–10", () => {
  assert.throws(
    () =>
      validateSubmitFeedbackInput({
        userId: null,
        sessionId: null,
        score: 11,
        message: "ok",
        email: null,
        source: "footer",
      }),
    (error: unknown) =>
      error instanceof SubmitFeedbackError && error.code === "invalid_input",
  );
});

test("validateSubmitFeedbackInput rejects a malformed guest email", () => {
  assert.throws(
    () =>
      validateSubmitFeedbackInput({
        userId: null,
        sessionId: null,
        score: 6,
        message: "ok",
        email: "not-an-email",
        source: "footer",
      }),
    (error: unknown) =>
      error instanceof SubmitFeedbackError && error.code === "invalid_email",
  );
});

test("submitFeedback inserts a footer row for a guest", async () => {
  const mock = makeConnection();
  const result = await submitFeedback(
    {
      userId: null,
      sessionId: null,
      score: 4,
      message: "Додайте друк",
      email: "guest@example.com",
      source: "footer",
    },
    { getConnection: async () => mock.connection },
  );

  assert.deepEqual(result, { id: 12 });
  const insert = mock.calls.find((c) =>
    c.sql.includes("INSERT INTO site_feedback"),
  );
  assert.ok(insert);
  assert.deepEqual(insert!.params, [
    null,
    null,
    4,
    "Додайте друк",
    "guest@example.com",
    "footer",
  ]);
});
