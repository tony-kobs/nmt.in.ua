import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMatchAnswer,
  clampTaskIndex,
  formatNmtClock,
  matchLetterAt,
} from "./nmtSession";

test("formatNmtClock pads and never goes negative", () => {
  assert.equal(formatNmtClock(0), "00:00");
  assert.equal(formatNmtClock(65), "01:05");
  assert.equal(formatNmtClock(-4), "00:00");
  assert.equal(formatNmtClock(3600), "60:00");
});

test("clampTaskIndex rejects steps outside the paper", () => {
  assert.equal(clampTaskIndex(0, 22), 0);
  assert.equal(clampTaskIndex(21, 22), 21);
  assert.equal(clampTaskIndex(-1, 22), null);
  assert.equal(clampTaskIndex(22, 22), null);
  assert.equal(clampTaskIndex(0, 0), null);
});

test("matchLetterAt reads a stored or Cyrillic pair", () => {
  assert.equal(matchLetterAt("1b;2d;3a", 2), "d");
  assert.equal(matchLetterAt("1Б;2Г;3А", 1), "b");
  assert.equal(matchLetterAt("", 1), "");
});

test("buildMatchAnswer waits until every row has a letter", () => {
  assert.equal(buildMatchAnswer(["a", "b", ""]), null);
  assert.equal(buildMatchAnswer(["a", "c", "e"]), "1a;2c;3e");
});
