import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { getFeedbackList } from "./getFeedbackList";

test("getFeedbackList maps newest rows and skips invalid scores", async () => {
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async () =>
      [
        {
          id: 2,
          user_id: 1,
          session_id: 38,
          score: 5,
          message: " Зручно ",
          email: null,
          source: "post_test",
          created_at: new Date("2026-09-05T10:00:00Z"),
          display_name: " Олена ",
          login: "demo-student",
        },
        {
          id: 1,
          user_id: null,
          session_id: null,
          score: 11,
          message: "bad",
          email: "a@b.c",
          source: "footer",
          created_at: "2026-09-01T10:00:00Z",
          display_name: null,
          login: null,
        },
      ] as never,
    execute: async (sql) => {
      if (sql.includes("CREATE TABLE")) {
        return { insertId: 0, affectedRows: 0 };
      }
      return { insertId: 0, affectedRows: 0 };
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };

  const rows = await getFeedbackList({
    getConnection: async () => connection,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.score, 5);
  assert.equal(rows[0]?.userDisplayName, "Олена");
  assert.equal(rows[0]?.source, "post_test");
  assert.equal(rows[0]?.message, "Зручно");
});
