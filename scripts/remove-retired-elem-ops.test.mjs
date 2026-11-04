import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("./sql/065_remove_elem_ops_theme.sql", import.meta.url), "utf8");

test("065 deletes the retired theme only and keeps student attempts", () => {
  assert.match(sql, /MATH-05-ELEM-OPS/);
  assert.match(sql, /th\.id = 1 AND th\.code = 'MATH-05-ELEM-OPS'/);
  assert.match(sql, /t2s\.task_type = 1/);
  assert.match(sql, /SET nmt\.theme_id = NULL/);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+task_sessions/i);
  assert.doesNotMatch(sql, /DELETE\s+\w+\s+FROM\s+task_sessions/i);
  assert.match(sql, /TRIM\(REPLACE\(REPLACE\(REPLACE\(name, '\\\\n'/);
});
