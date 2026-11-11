import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import {
  createThemeLevel,
  deleteThemeLevel,
  updateThemeLevel,
} from "./themeLevels";
import { AdminContentError } from "./types";

function scripted(handlers: {
  query?: (sql: string, params?: unknown[]) => unknown[];
  execute?: (
    sql: string,
    params?: unknown[],
  ) => { insertId: number; affectedRows: number };
}) {
  const executed: { sql: string; params?: unknown[] }[] = [];
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async <T,>(sql: string, params?: unknown[]) =>
      (handlers.query ? handlers.query(sql, params) : []) as T[],
    execute: async (sql, params) => {
      executed.push({ sql, params });
      return handlers.execute
        ? handlers.execute(sql, params)
        : { insertId: 4, affectedRows: 1 };
    },
  };
  return { connection, executed };
}

const boolAndRange = {
  themeId: 5,
  name: "звичайні дроби, без модуля, 2–3 дії",
  rules: [
    { paramId: 1, boolValue: 1 as const, intMin: null, intMax: null },
    { paramId: 2, boolValue: 0 as const, intMin: null, intMax: null },
    { paramId: 3, boolValue: null, intMin: 2, intMax: 3 },
  ],
};

function paramsQuery(sql: string) {
  if (sql.includes("FROM themes")) return [{ id: 5 }];
  if (sql.includes("FROM theme_params")) {
    return [
      { id: 1, value_type: "bool" },
      { id: 2, value_type: "bool" },
      { id: 3, value_type: "int" },
    ];
  }
  if (sql.includes("COUNT(*)")) return [{ total: 0, max_sort: -1 }];
  if (sql.includes("FROM theme_levels")) return [{ id: 4 }];
  return [];
}

test("createThemeLevel stores a bool as 0 or 1 and an int as an inclusive range", async () => {
  const db = scripted({ query: paramsQuery });
  const saved = await createThemeLevel(boolAndRange, {
    getConnection: async () => db.connection,
  });
  assert.equal(saved.id, 4);
  assert.equal(saved.rules[2]?.intMin, 2);
  assert.equal(saved.rules[2]?.intMax, 3);
  const rules = db.executed.filter((call) =>
    call.sql.includes("INSERT INTO theme_level_rules"),
  );
  assert.equal(rules.length, 3);
  assert.deepEqual(rules[0]?.params, [4, 1, 1, null, null]);
  assert.deepEqual(rules[1]?.params, [4, 2, 0, null, null]);
  assert.deepEqual(rules[2]?.params, [4, 3, null, 2, 3]);
});

test("createThemeLevel refuses a level with no rules", async () => {
  const db = scripted({ query: paramsQuery });
  await assert.rejects(
    () =>
      createThemeLevel(
        { ...boolAndRange, rules: [] },
        { getConnection: async () => db.connection },
      ),
    (error: unknown) =>
      error instanceof AdminContentError && error.code === "rules_required",
  );
  assert.equal(
    db.executed.some((call) => call.sql.includes("INSERT INTO theme_levels")),
    false,
  );
});

test("updateThemeLevel replaces the previous rules in the same transaction", async () => {
  const db = scripted({ query: paramsQuery });
  await updateThemeLevel(
    { ...boolAndRange, levelId: 4, rules: boolAndRange.rules.slice(0, 1) },
    { getConnection: async () => db.connection },
  );
  assert.match(db.executed[1]?.sql ?? "", /DELETE FROM theme_level_rules/);
  assert.deepEqual(db.executed[1]?.params, [4]);
  assert.match(db.executed[2]?.sql ?? "", /INSERT INTO theme_level_rules/);
  assert.equal(
    db.executed.filter((call) => call.sql.includes("INSERT INTO theme_level_rules"))
      .length,
    1,
  );
});

test("deleteThemeLevel removes rules and then the level", async () => {
  const db = scripted({ query: paramsQuery });
  await deleteThemeLevel(5, 4, { getConnection: async () => db.connection });
  assert.match(db.executed[0]?.sql ?? "", /DELETE FROM theme_level_rules/);
  assert.match(db.executed[1]?.sql ?? "", /DELETE FROM theme_levels/);
  assert.deepEqual(db.executed[1]?.params, [4, 5]);
});

test("an int rule without a range is rejected before insert", async () => {
  const db = scripted({ query: paramsQuery });
  await assert.rejects(
    () =>
      createThemeLevel(
        {
          themeId: 5,
          name: "Дії",
          rules: [{ paramId: 3, boolValue: null, intMin: null, intMax: null }],
        },
        { getConnection: async () => db.connection },
      ),
    (error: unknown) =>
      error instanceof AdminContentError && error.code === "invalid_input",
  );
});
