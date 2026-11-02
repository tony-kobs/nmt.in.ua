import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { sqlNumberProblems } from "./check-sql-numbers.mjs";

const sqlDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "sql");

test("scripts/sql has no new duplicate migration numbers", () => {
  const names = readdirSync(sqlDir).filter((name) => name.endsWith(".sql"));
  assert.deepEqual(sqlNumberProblems(names), []);
});

test("a new shared number fails and the historical pairs stay allowed", () => {
  assert.deepEqual(sqlNumberProblems(["063_one.sql", "064_two.sql"]), []);
  assert.deepEqual(
    sqlNumberProblems(["032_stage2_bank.sql", "032_teacher_ratings.sql"]),
    [],
  );
  assert.match(
    sqlNumberProblems(["063_one.sql", "063_two.sql"]).join("\n"),
    /063/,
  );
  assert.match(
    sqlNumberProblems([
      "032_stage2_bank.sql",
      "032_teacher_ratings.sql",
      "032_extra.sql",
    ]).join("\n"),
    /032/,
  );
});
