import assert from "node:assert/strict";
import test from "node:test";

import {
  isValidSelfScore,
  reduceLatestSelfScores,
  resolveDisplaySelfScore,
} from "./types";

test("isValidSelfScore accepts the full 1-10 integer range", () => {
  assert.equal(isValidSelfScore(1), true);
  assert.equal(isValidSelfScore(10), true);
  assert.equal(isValidSelfScore(5), true);
});

test("isValidSelfScore rejects out-of-range, non-integer, and non-numeric values", () => {
  assert.equal(isValidSelfScore(0), false);
  assert.equal(isValidSelfScore(11), false);
  assert.equal(isValidSelfScore(1.5), false);
  assert.equal(isValidSelfScore("5"), false);
  assert.equal(isValidSelfScore(null), false);
  assert.equal(isValidSelfScore(undefined), false);
  assert.equal(isValidSelfScore(NaN), false);
});

test("reduceLatestSelfScores keeps the first (newest) pre_topic row per theme", () => {
  const latest = reduceLatestSelfScores([
    { theme_id: 5, score: 8, source: "pre_topic" },
    { theme_id: 5, score: 3, source: "pre_topic" },
    { theme_id: 6, score: 4, source: "pre_topic" },
  ]);
  assert.equal(latest.byTheme.get(5), 8);
  assert.equal(latest.byTheme.get(6), 4);
  assert.equal(latest.overall, null);
});

test("reduceLatestSelfScores keeps the first (newest) diagnostic_overall row", () => {
  const latest = reduceLatestSelfScores([
    { theme_id: null, score: 7, source: "diagnostic_overall" },
    { theme_id: null, score: 2, source: "diagnostic_overall" },
  ]);
  assert.equal(latest.overall, 7);
});

test("resolveDisplaySelfScore prefers pre_topic over the general fallback", () => {
  const latest = reduceLatestSelfScores([
    { theme_id: 1, score: 9, source: "pre_topic" },
    { theme_id: null, score: 3, source: "diagnostic_overall" },
  ]);
  assert.equal(resolveDisplaySelfScore(1, latest), 9);
});

test("resolveDisplaySelfScore falls back to diagnostic_overall when no pre_topic exists for the theme", () => {
  const latest = reduceLatestSelfScores([
    { theme_id: null, score: 6, source: "diagnostic_overall" },
  ]);
  assert.equal(resolveDisplaySelfScore(42, latest), 6);
});

test("resolveDisplaySelfScore returns null when neither exists", () => {
  const latest = reduceLatestSelfScores([]);
  assert.equal(resolveDisplaySelfScore(1, latest), null);
});
