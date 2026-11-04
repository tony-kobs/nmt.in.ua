import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import catalog from "@/content/workbookProblems.json";
import {
  THEME_CODE_ORDER,
  problemThemeCodeCaseSql,
  problemThemeJoinSql,
  workbookTopicLinks,
} from "./workbookTopicMap";

test("theme code order matches scripts/sql/010_theme_codes.sql", () => {
  const sql = readFileSync("scripts/sql/010_theme_codes.sql", "utf8");
  const codes = [...sql.matchAll(/WHEN \d+ THEN '([A-Z0-9-]+)'/g)].map((match) => match[1]);
  assert.deepEqual(codes, [...THEME_CODE_ORDER]);
});

test("every JSON topic is mapped once and does not use the retired elementary-ops code", () => {
  const links = workbookTopicLinks();
  assert.deepEqual(
    links.map((link) => link.jsonId),
    catalog.themes.map((theme) => theme.id),
  );
  for (const link of links) {
    const theme = catalog.themes.find((row) => row.id === link.jsonId);
    assert.equal(link.jsonName, theme?.name);
    assert.equal(link.code === "MATH-05-ELEM-OPS", false);
    const tasks = catalog.problems.filter((row) => row.theme_id === link.jsonId);
    assert.equal(tasks.length, link.jsonId === 22 ? 19 : 20);
  }
  assert.equal(
    links.find((link) => link.jsonId === 1)?.code,
    "MATH-06-ARITH-OPS",
  );
  assert.equal(
    links.find((link) => link.jsonId === 4)?.code,
    "ALG-08-FRACTIONS",
  );
  const review = links.filter((link) => link.confidence === "review").map((link) => link.jsonId);
  assert.deepEqual(review, [3, 15, 19, 22]);
  assert.equal(links.find((link) => link.jsonId === 22)?.code, null);
});

test("problem rows join themes by the mapped code", () => {
  const sql = problemThemeCodeCaseSql();
  assert.match(sql, /CASE p\.theme_id/);
  assert.match(sql, /WHEN 4 THEN 'ALG-08-FRACTIONS'/);
  assert.match(sql, /WHEN 1 THEN 'MATH-06-ARITH-OPS'/);
  assert.match(sql, /WHEN 5 THEN 'ALG-09-EQ-INEQ'/);
  assert.equal(sql.includes("MATH-05-ELEM-OPS"), false);
  assert.equal(sql.includes("WHEN 22 THEN"), false);
  const join = problemThemeJoinSql();
  assert.match(join, /LEFT JOIN themes t ON t\.code = CASE p\.theme_id/);
  assert.equal(join.includes("t.id = p.theme_id"), false);
});
