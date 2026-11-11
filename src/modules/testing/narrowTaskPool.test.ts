import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import {
  narrowTaskIdsByLevel,
  ThemeLevelPoolError,
} from "./narrowTaskPool";

type Query = (sql: string, params?: unknown[]) => unknown[];

function connection(query: Query): SqlConnection {
  return {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async () => ({ insertId: 0, affectedRows: 0 }),
    query: async <T,>(sql: string, params?: unknown[]) => query(sql, params) as T[],
  };
}

const pool = [10, 11, 12, 13];

function scripted(): { db: SqlConnection; calls: string[] } {
  const calls: string[] = [];
  const db = connection((sql, params) => {
    calls.push(sql);
    if (sql.includes("FROM theme_levels")) {
      return Number(params?.[0]) === 7 && Number(params?.[1]) === 4
        ? [{ id: 7 }]
        : [];
    }
    if (sql.includes("FROM theme_level_rules")) {
      return [
        {
          param_id: 1,
          value_type: "bool",
          bool_value: 1,
          int_min: null,
          int_max: null,
        },
        {
          param_id: 3,
          value_type: "int",
          bool_value: null,
          int_min: 2,
          int_max: 3,
        },
      ];
    }
    if (sql.includes("FROM quiz_task_params")) {
      return [
        { task_id: 10, param_id: 1, int_value: 1 },
        { task_id: 10, param_id: 3, int_value: 2 },
        { task_id: 11, param_id: 1, int_value: 1 },
        { task_id: 12, param_id: 1, int_value: 0 },
        { task_id: 12, param_id: 3, int_value: 2 },
        { task_id: 13, param_id: 1, int_value: 1 },
        { task_id: 13, param_id: 3, int_value: 8 },
      ];
    }
    return [];
  });
  return { db, calls };
}

test("no level returns the pool and does not query", async () => {
  const { db, calls } = scripted();
  const result = await narrowTaskIdsByLevel(db, 4, pool, null);
  assert.deepEqual(result, { ids: pool, emptyLevel: false });
  assert.deepEqual(calls, []);
  const omitted = await narrowTaskIdsByLevel(db, 4, pool, undefined);
  assert.deepEqual(omitted.ids, pool);
  assert.deepEqual(calls, []);
});

test("a level keeps only tasks whose stored values match every rule", async () => {
  const { db } = scripted();
  const result = await narrowTaskIdsByLevel(db, 4, pool, 7);
  assert.deepEqual(result, { ids: [10], emptyLevel: false });
});

test("a task without a value for a rule's parameter is dropped", async () => {
  const { db } = scripted();
  const result = await narrowTaskIdsByLevel(db, 4, [11], 7);
  assert.deepEqual(result, { ids: [], emptyLevel: true });
});

test("an empty match is reported and does not throw", async () => {
  const { db } = scripted();
  const result = await narrowTaskIdsByLevel(db, 4, [12, 13], 7);
  assert.deepEqual(result, { ids: [], emptyLevel: true });
});

test("a level from another theme is refused", async () => {
  const { db } = scripted();
  await assert.rejects(
    () => narrowTaskIdsByLevel(db, 4, pool, 99),
    (error: unknown) => error instanceof ThemeLevelPoolError,
  );
});
