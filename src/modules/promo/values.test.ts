import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  accessBase,
  addAccessDays,
  attributionFromSearch,
  mergeAttribution,
  normalizePromoCode,
  normalizeTeacherRef,
  parseAccessDays,
  parseMaxUses,
} from "./values";

test("promo codes ignore case and spaces and reject junk", () => {
  assert.equal(normalizePromoCode(" open-day "), "OPEN-DAY");
  assert.equal(normalizePromoCode("Open Day"), "OPENDAY");
  assert.equal(normalizePromoCode("ab"), null);
  assert.equal(normalizePromoCode("-OPEN"), null);
  assert.equal(normalizePromoCode("OPEN-"), null);
  assert.equal(normalizePromoCode("OP--EN"), null);
  assert.equal(normalizePromoCode("код"), null);
});

test("a numeric ref is an id and a slug is lower case", () => {
  assert.equal(normalizeTeacherRef(" 12 "), "12");
  assert.equal(normalizeTeacherRef("Maria-K"), "maria-k");
  assert.equal(normalizeTeacherRef("1"), "1");
  assert.equal(normalizeTeacherRef("0"), null);
  assert.equal(normalizeTeacherRef("a"), null);
  assert.equal(normalizeTeacherRef("../maria"), null);
});

test("the link just opened wins over the stored cookie", () => {
  const params = new URLSearchParams("promo=newcode&ref=9");
  assert.deepEqual(
    mergeAttribution(attributionFromSearch(params), {
      promo: "OLDCODE",
      ref: "old-slug",
    }),
    { promo: "NEWCODE", ref: "9" },
  );
  assert.deepEqual(
    mergeAttribution(attributionFromSearch(new URLSearchParams()), {
      promo: "OLDCODE",
      ref: "old-slug",
    }),
    { promo: "OLDCODE", ref: "old-slug" },
  );
});

test("access days are a positive cap and empty uses means unlimited", () => {
  assert.equal(parseAccessDays("14"), 14);
  assert.equal(parseAccessDays("0"), null);
  assert.equal(parseAccessDays("3661"), null);
  assert.equal(parseMaxUses(""), null);
  assert.equal(parseMaxUses("3"), 3);
  assert.equal(parseMaxUses("0"), "invalid");
});

test("a second code extends a window that is still open", () => {
  const now = new Date("2026-06-01T12:00:00.000Z");
  const first = addAccessDays(accessBase(now, null), 10);
  const second = addAccessDays(accessBase(now, first), 5);
  assert.equal(first.toISOString(), "2026-06-11T12:00:00.000Z");
  assert.equal(second.toISOString(), "2026-06-16T12:00:00.000Z");
  const expired = new Date("2026-05-01T00:00:00.000Z");
  assert.equal(accessBase(now, expired).toISOString(), now.toISOString());
});

test("migration 076 is idempotent and listed for auth", () => {
  const sql = readFileSync("scripts/sql/076_promo_codes.sql", "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS promo_codes/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS promo_redemptions/);
  assert.match(sql, /uq_promo_redemptions_code_user/);
  const users = readFileSync("src/modules/auth/users.ts", "utf8");
  assert.match(users, /076_promo_codes\.sql/);
  const docs = readFileSync("docs/schema-migrations.md", "utf8");
  assert.match(docs, /076_promo_codes\.sql/);
});
