import assert from "node:assert/strict";
import test from "node:test";
import {
  bankSearchLike,
  bankSearchPages,
  beginBankSearch,
  isLatestBankRequest,
  matchesBankQuery,
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

test("a short query matches the whole bank text, not a raw page", () => {
  assert.equal(matchesBankQuery({
    id: 1,
    name: "Степінь",
    prompt: "Сума двох чисел: $x^{2}$.",
    query: "у",
  }), true);
  assert.equal(matchesBankQuery({
    id: 4,
    name: "n",
    prompt: "$x^{2}$",
    query: "X^2",
  }), true);
  assert.equal(matchesBankQuery({
    id: 12,
    name: "",
    prompt: "інше",
    query: "12",
  }), true);
  assert.equal(matchesBankQuery({
    id: 1,
    name: "порожньо",
    prompt: "текст",
    query: "   ",
  }), true);
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
