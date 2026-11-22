import assert from "node:assert/strict";
import test from "node:test";
import {
  bankNormalizedSql,
  bankSearchLike,
  bankSearchPages,
  beginBankSearch,
  isLatestBankRequest,
  normalizeBankSearchText,
  type BankSearchState,
} from "./bankSearchText";

const start: BankSearchState = {
  query: "",
  page: 3,
  themeId: "",
  difficulty: "0",
  optionCount: 0,
  subject: "math",
  request: 4,
};

test("bank search ignores case, spaces, apostrophes and formula markup", () => {
  assert.equal(normalizeBankSearchText("  Дроби  "), normalizeBankSearchText("дроби"));
  assert.equal(normalizeBankSearchText("2  +   2"), normalizeBankSearchText("2+2"));
  assert.equal(normalizeBankSearchText("п'ять"), normalizeBankSearchText("пʼять"));
  assert.equal(normalizeBankSearchText("п’ять"), normalizeBankSearchText("п'ять"));
  assert.equal(normalizeBankSearchText("$x^{2}$"), "x2");
  assert.equal(normalizeBankSearchText("x^2"), "x2");
  assert.equal(normalizeBankSearchText("**жирний**"), "жирний");
  assert.equal(bankSearchLike("x^2"), "%x2%");
});

test("the SQL reading strips the same marks as the query", () => {
  const sql = bankNormalizedSql("q.task_text");
  assert.match(sql, /LOWER\(/);
  assert.match(sql, /REPLACE\(/);
  assert.match(sql, /ʼ/);
  assert.match(sql, /' ', ''\)$/);
  assert.doesNotMatch(sql, /right_answer_n/);
});

test("a new query or filter returns to the first page and ignores a stale reply", () => {
  const typed = beginBankSearch(start, { query: "дроби" });
  assert.equal(typed.page, 1);
  assert.equal(typed.request, 5);
  const filtered = beginBankSearch(typed, { themeId: "8", page: 4 });
  assert.equal(filtered.page, 1);
  assert.equal(filtered.themeId, "8");
  const paged = beginBankSearch(filtered, { page: 2 });
  assert.equal(paged.page, 2);
  assert.equal(paged.query, "дроби");
  assert.equal(isLatestBankRequest(paged.request, typed.request), false);
  assert.equal(isLatestBankRequest(paged.request, paged.request), true);
  assert.equal(bankSearchPages(41), 3);
  assert.equal(bankSearchPages(0), 1);
});
