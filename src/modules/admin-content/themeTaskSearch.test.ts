import assert from "node:assert/strict";
import test from "node:test";

import { themeTaskSearchClause, themeTaskStatusClause } from "./store";

test("an empty search keeps the whole theme bank", () => {
  assert.deepEqual(themeTaskSearchClause("  "), { sql: "", params: [] });
});

test("search matches the title and the question, with LIKE wildcards escaped", () => {
  const clause = themeTaskSearchClause("  100%_яблук  ");
  assert.match(clause.sql, /q\.name LIKE \? ESCAPE/);
  assert.match(clause.sql, /q\.task_text LIKE \? ESCAPE/);
  assert.equal(clause.params[0], "%100\\%\\_яблук%");
  assert.equal(clause.params[1], clause.params[0]);
});

test("status filter is published, draft, or the whole bank", () => {
  assert.deepEqual(themeTaskStatusClause("draft"), {
    sql: " AND q.status = ?",
    params: ["draft"],
  });
  assert.deepEqual(themeTaskStatusClause("published"), {
    sql: " AND q.status = ?",
    params: ["published"],
  });
  assert.deepEqual(themeTaskStatusClause("all"), { sql: "", params: [] });
});
