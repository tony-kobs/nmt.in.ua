import assert from "node:assert/strict";
import test from "node:test";

import { themeTaskSearchClause } from "./store";

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
