import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import { SESSION_STATUS_COMPLETED } from "@/modules/sessions/types";

import { getRecentResults } from "./getRecentResults";

test("getRecentResults maps completed sessions to sidebar items", async () => {
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async (sql, params) => {
      assert.match(sql, /session_status = \?/);
      assert.match(sql, /LIMIT 4\b/);
      assert.deepEqual(params, [1, SESSION_STATUS_COMPLETED]);
      return [
        {
          id: 99,
          theme_name: " Синтаксис ",
          tasks_number: 10,
          right_number: 8,
        },
        {
          id: 88,
          theme_name: "Морфологія",
          tasks_number: 5,
          right_number: 2,
        },
      ] as never[];
    },
    execute: async () => ({ insertId: 0, affectedRows: 0 }),
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };

  const items = await getRecentResults(1, 4, {
    getConnection: async () => connection,
  });

  assert.deepEqual(items, [
    { sessionId: 99, topic: "Синтаксис", score: 80 },
    { sessionId: 88, topic: "Морфологія", score: 40 },
  ]);
});

test("getRecentResults uses a LEFT JOIN and a fallback label for a claimed diagnostic attempt (theme_id NULL)", async () => {
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async (sql, params) => {
      assert.match(sql, /LEFT JOIN themes/);
      assert.deepEqual(params, [1, SESSION_STATUS_COMPLETED]);
      return [
        {
          id: 42,
          theme_name: "Загальна діагностика",
          tasks_number: 20,
          right_number: 15,
        },
      ] as never[];
    },
    execute: async () => ({ insertId: 0, affectedRows: 0 }),
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };

  const items = await getRecentResults(1, 4, {
    getConnection: async () => connection,
  });

  assert.deepEqual(items, [
    { sessionId: 42, topic: "Загальна діагностика", score: 75 },
  ]);
});

test("getRecentResults returns empty list when user has no completed sessions", async () => {
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async () => [] as never[],
    execute: async () => ({ insertId: 0, affectedRows: 0 }),
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };

  const items = await getRecentResults(1, 4, {
    getConnection: async () => connection,
  });

  assert.deepEqual(items, []);
});
