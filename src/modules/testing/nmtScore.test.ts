import assert from "node:assert/strict";
import test from "node:test";

import {
  NMT_MATH_SCALE_2026,
  NMT_PASS_TEST_POINTS,
  NMT_SCALE_PAPER_MAX,
  matchPairs,
  nmtMathScaleScore,
  pointsForNmtTask,
  scoreMatchPairs,
  scoreNmtPaper,
} from "./nmtScore";

test("a 2026 maths paper scores 15 + 9 + 8 = 32", () => {
  const tasks = [
    ...Array.from({ length: 15 }, () => ({ kind: "mcq" as const, correct: true })),
    ...Array.from({ length: 3 }, () => ({
      kind: "match" as const,
      keyText: "1b;2c;3a",
      answerText: "1b;2c;3a",
    })),
    ...Array.from({ length: 4 }, () => ({ kind: "open" as const, correct: true })),
  ];
  const score = scoreNmtPaper(tasks);
  assert.equal(score.testPoints, 32);
  assert.equal(score.maxTestPoints, 32);
  assert.equal(score.scaleScore, 200);
  assert.equal(score.passed, true);
});

test("matching gives one point per correct pair, including a Cyrillic letter", () => {
  assert.deepEqual(scoreMatchPairs("1b;2d;3a", "1b;2c;3a"), { earned: 2, max: 3 });
  assert.equal(
    pointsForNmtTask({
      kind: "match",
      keyText: "1b;2d;3a",
      answerText: "1Б;2Г;3А",
    }),
    3,
  );
  const pairs = matchPairs("1б;2в;3а");
  assert.equal(pairs.get("1"), "b");
  assert.equal(pairs.get("2"), "c");
  assert.equal(pairs.get("3"), "a");
});

test("a wrong open answer is 0 and a correct one is 2", () => {
  assert.equal(pointsForNmtTask({ kind: "open", correct: false }), 0);
  assert.equal(pointsForNmtTask({ kind: "open", correct: true }), 2);
  assert.equal(pointsForNmtTask({ kind: "mcq", correct: true }), 1);
});

test("stored awarded points override a later status and stay inside the task max", () => {
  assert.equal(
    pointsForNmtTask({
      kind: "match",
      correct: false,
      awardedPoints: 2,
      keyText: "1a;2b;3c",
    }),
    2,
  );
  assert.equal(
    pointsForNmtTask({ kind: "mcq", awardedPoints: 9, correct: true }),
    1,
  );
});

test("a 20-task paper does not pretend the maximum is 32 or 22", () => {
  const tasks = [
    ...Array.from({ length: 14 }, () => ({ kind: "mcq" as const, correct: true })),
    ...Array.from({ length: 3 }, () => ({
      kind: "match" as const,
      correct: true,
      keyText: "1a;2b;3c",
    })),
    ...Array.from({ length: 3 }, () => ({ kind: "open" as const, correct: false })),
  ];
  assert.equal(tasks.length, 20);
  const score = scoreNmtPaper(tasks);
  assert.equal(score.maxTestPoints, 14 + 9 + 6);
  assert.equal(score.testPoints, 14 + 9);
  assert.equal(score.scaleScore, null);
});

test("the 2026 scale matches the ministry table and starts at 5", () => {
  assert.equal(NMT_MATH_SCALE_2026[5], 100);
  assert.equal(NMT_MATH_SCALE_2026[18], 150);
  assert.equal(NMT_MATH_SCALE_2026[32], 200);
  assert.equal(Object.keys(NMT_MATH_SCALE_2026).length, 28);
  assert.equal(nmtMathScaleScore(4, NMT_SCALE_PAPER_MAX), null);
  assert.equal(nmtMathScaleScore(NMT_PASS_TEST_POINTS, NMT_SCALE_PAPER_MAX), 100);
  assert.equal(nmtMathScaleScore(15, 29), null);
  const full = scoreNmtPaper([
    { kind: "mcq", correct: false },
    { kind: "mcq", awardedPoints: 1 },
    { kind: "match", awardedPoints: 3, keyText: "1a;2b;3c" },
  ]);
  assert.equal(full.passed, false);
});
