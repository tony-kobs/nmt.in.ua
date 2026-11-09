import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SQL_UPSERT_WORKBOOK_MARKER,
  chunkProblems,
  countWorkbookChanges,
  isWorkbookCatalogReady,
  parseImportArgs,
  planWorkbookImport,
  problemUpsertParams,
  problemUpsertSql,
  workbookCatalogExpected,
  workbookCatalogRevision,
  workbookProblemKey,
} from "./lib/workbook-catalog.mjs";

const catalog = JSON.parse(readFileSync("src/content/workbookProblems.json", "utf8"));
const problems = catalog.problems;
const expected = workbookCatalogExpected(problems);

test("workbook revision is a stable hash of all 439 tasks", () => {
  assert.equal(problems.length, 439);
  assert.equal(expected.count, 439);
  assert.equal(expected.ids.length, 439);
  assert.equal(expected.revision, workbookCatalogRevision(problems));
  assert.match(expected.revision, /^[a-f0-9]{64}$/);
  const reversed = workbookCatalogRevision([...problems].reverse());
  assert.equal(reversed, expected.revision);
  const edited = problems.map((problem, index) =>
    index === 0 ? { ...problem, problem_text: `${problem.problem_text}!` } : problem,
  );
  assert.notEqual(workbookCatalogRevision(edited), expected.revision);
});

test("import plan is idempotent and the upsert never deletes", () => {
  assert.deepEqual(planWorkbookImport([], expected.ids), {
    insert: 439,
    update: 0,
    total: 439,
  });
  assert.deepEqual(planWorkbookImport(expected.ids, expected.ids), {
    insert: 0,
    update: 439,
    total: 439,
  });
  assert.deepEqual(planWorkbookImport([1, 2], expected.ids), {
    insert: 437,
    update: 2,
    total: 439,
  });

  const chunks = chunkProblems(problems);
  assert.equal(chunks.length, 11);
  assert.equal(chunks[0].length, 40);
  assert.equal(chunks.at(-1).length, 39);
  const sql = problemUpsertSql(2);
  assert.match(sql, /INSERT INTO problems/);
  assert.match(sql, /AS incoming ON DUPLICATE KEY UPDATE/);
  assert.match(sql, /problem_text = incoming\.problem_text/);
  assert.match(sql, /theme_id = incoming\.theme_id/);
  assert.equal(sql.includes("DELETE"), false);
  assert.equal(sql.includes("VALUES("), false);
  assert.equal(problemUpsertParams(chunks[0]).length, 40 * 11);
  assert.match(SQL_UPSERT_WORKBOOK_MARKER, /workbook_catalog/);
  assert.equal(SQL_UPSERT_WORKBOOK_MARKER.includes("DELETE"), false);
});

test("the page stays on JSON until every catalog id is marked", () => {
  assert.equal(isWorkbookCatalogReady(null, expected.ids, expected), false);
  assert.equal(
    isWorkbookCatalogReady(
      { revision: "other", problemCount: expected.count },
      expected.ids,
      expected,
    ),
    false,
  );
  assert.equal(
    isWorkbookCatalogReady(
      { revision: expected.revision, problemCount: expected.count },
      expected.ids.slice(0, -1),
      expected,
    ),
    false,
  );
  assert.equal(
    isWorkbookCatalogReady(
      { revision: expected.revision, problemCount: expected.count },
      expected.ids,
      expected,
    ),
    true,
  );
});

test("dry-run counts rows that differ without treating an equal copy as a change", () => {
  const same = countWorkbookChanges(problems, problems);
  assert.deepEqual(same, { missing: 0, different: 0, same: 439, sampleIds: [] });
  const changed = { ...problems[3], problem_text: "інший текст" };
  const diff = countWorkbookChanges([changed], problems);
  assert.equal(diff.different, 1);
  assert.equal(diff.missing, 438);
  assert.equal(diff.sampleIds.includes(changed.id), true);
  assert.equal(workbookProblemKey(problems[0]), workbookProblemKey({ ...problems[0] }));
});

test("import arguments default to a dry run", () => {
  assert.deepEqual(parseImportArgs([]), { apply: false });
  assert.deepEqual(parseImportArgs(["--apply"]), { apply: true });
  assert.equal(parseImportArgs(["--help"]).help, true);
  assert.equal(parseImportArgs(["--apply", "--yes"]).error, "--yes");
});
