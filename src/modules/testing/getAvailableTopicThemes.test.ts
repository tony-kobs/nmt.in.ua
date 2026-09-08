import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import { getAvailableTopicThemes } from "./getAvailableTopicThemes";

function makeConnection(
  rows: Array<{ id: number; code: string; name: string; ord: number; task_count: number }>,
) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  let released = false;

  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async (sql, params) => {
      calls.push({ sql, params });
      return rows as never[];
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

test("getAvailableTopicThemes queries themes with at least one task and maps rows", async () => {
  const { connection, calls, isReleased } = makeConnection([
    {
      id: 2,
      code: "MATH-06-ARITH-OPS",
      name: "  Арифметичні дії  ",
      ord: 2,
      task_count: 10,
    },
    {
      id: 99901,
      code: "T-99901",
      name: "Smoke test theme",
      ord: 999,
      task_count: 1,
    },
  ]);

  const themes = await getAvailableTopicThemes({
    getConnection: async () => connection,
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0]!.sql, /FROM themes t/);
  assert.match(calls[0]!.sql, /t\.code/);
  assert.match(calls[0]!.sql, /HAVING task_count >= 1/);
  assert.equal(calls[0]?.params, undefined);
  assert.deepEqual(themes, [
    {
      id: 2,
      code: "MATH-06-ARITH-OPS",
      name: "Арифметичні дії",
      ord: 2,
      taskCount: 10,
    },
    {
      id: 99901,
      code: "T-99901",
      name: "Smoke test theme",
      ord: 999,
      taskCount: 1,
    },
  ]);
  assert.equal(isReleased(), true);
});

test("getAvailableTopicThemes returns an empty list when no theme qualifies", async () => {
  const { connection, isReleased } = makeConnection([]);

  const themes = await getAvailableTopicThemes({
    getConnection: async () => connection,
  });

  assert.deepEqual(themes, []);
  assert.equal(isReleased(), true);
});
