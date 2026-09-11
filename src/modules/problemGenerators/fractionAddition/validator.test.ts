import assert from "node:assert/strict";
import test from "node:test";
import { validateFractionAdditionAnswer } from "./validator";
import type {
  FractionAdditionMissingNumeratorTask,
  FractionAdditionSumTask,
} from "./types";
import { describeFractionSum } from "./fractionArithmetic";

function sumTask(
  denominator: number,
  numerators: number[],
  acceptRule: "reducedRequired" | "anyEquivalent",
): FractionAdditionSumTask {
  const operands = numerators.map((numerator) => ({ numerator, denominator }));
  const unreduced = { numerator: numerators.reduce((a, b) => a + b, 0), denominator };
  return {
    kind: "sum",
    topic: "fraction-addition-same-denominator",
    operation: "addition",
    difficulty: 1,
    denominator,
    operands,
    answer: { ...describeFractionSum(unreduced), acceptRule },
  };
}

// Level 1-style task: 2/7 + 3/7 = 5/7 (no reduction, anyEquivalent).
test("accepts the exact correct fraction (anyEquivalent)", () => {
  const task = sumTask(7, [2, 3], "anyEquivalent");
  const result = validateFractionAdditionAnswer(task, "5/7");
  assert.equal(result.isCorrect, true);
  assert.equal(result.isMathematicallyEquivalent, true);
  assert.equal(result.reason, "correct");
});

test("anyEquivalent accepts an unreduced-but-equal fraction too", () => {
  const task = sumTask(7, [2, 3], "anyEquivalent");
  const result = validateFractionAdditionAnswer(task, "10/14");
  assert.equal(result.isCorrect, true);
  assert.equal(result.isMathematicallyEquivalent, true);
});

test("rejects a wrong value", () => {
  const task = sumTask(7, [2, 3], "anyEquivalent");
  const result = validateFractionAdditionAnswer(task, "4/7");
  assert.equal(result.isCorrect, false);
  assert.equal(result.isMathematicallyEquivalent, false);
  assert.equal(result.reason, "notMathematicallyEquivalent");
});

test("rejects malformed input", () => {
  const task = sumTask(7, [2, 3], "anyEquivalent");
  for (const raw of ["", "abc", "5//7", "5/", "/7"]) {
    const result = validateFractionAdditionAnswer(task, raw);
    assert.equal(result.isCorrect, false);
    assert.equal(result.reason, "invalidFormat");
  }
});

// Level 3-style task: 3/8 + 1/8 = 4/8 = 1/2, reduction required.
test("reducedRequired: rejects the unreduced-but-equivalent form (4/8 vs 1/2)", () => {
  const task = sumTask(8, [3, 1], "reducedRequired");
  const unreduced = validateFractionAdditionAnswer(task, "4/8");
  assert.equal(unreduced.isCorrect, false);
  assert.equal(unreduced.isMathematicallyEquivalent, true);
  assert.equal(unreduced.reason, "reductionRequired");

  const reduced = validateFractionAdditionAnswer(task, "1/2");
  assert.equal(reduced.isCorrect, true);
  assert.equal(reduced.isMathematicallyEquivalent, true);
  assert.equal(reduced.reason, "correct");
});

// Level 4-style task: 9/7 + 5/7 = 14/7 = 2 (whole number).
test("reducedRequired with a whole-number answer: only the bare integer is canonical", () => {
  const task = sumTask(7, [9, 5], "reducedRequired");
  assert.equal(task.answer.whole, 2);

  const asWhole = validateFractionAdditionAnswer(task, "2");
  assert.equal(asWhole.isCorrect, true);
  assert.equal(asWhole.reason, "correct");

  const asImproperFraction = validateFractionAdditionAnswer(task, "14/7");
  assert.equal(asImproperFraction.isCorrect, false);
  assert.equal(asImproperFraction.isMathematicallyEquivalent, true);
  assert.equal(asImproperFraction.reason, "reductionRequired");
});

// Level 4-style task: 8/5 + 4/5 = 12/5 = 2 2/5 (mixed number).
test("reducedRequired with a mixed-number answer: mixed form is canonical, plain improper fraction is not", () => {
  const task = sumTask(5, [8, 4], "reducedRequired");
  assert.deepEqual(task.answer.mixed, { whole: 2, numerator: 2, denominator: 5 });

  const asMixed = validateFractionAdditionAnswer(task, "2 2/5");
  assert.equal(asMixed.isCorrect, true);
  assert.equal(asMixed.reason, "correct");

  const asImproperFraction = validateFractionAdditionAnswer(task, "12/5");
  assert.equal(asImproperFraction.isCorrect, false);
  assert.equal(asImproperFraction.isMathematicallyEquivalent, true);
  assert.equal(asImproperFraction.reason, "reductionRequired");

  const wrongMixed = validateFractionAdditionAnswer(task, "2 1/5");
  assert.equal(wrongMixed.isCorrect, false);
  assert.equal(wrongMixed.isMathematicallyEquivalent, false);
});

test("tolerates surrounding/inner whitespace in fraction and mixed-number input", () => {
  const task = sumTask(5, [8, 4], "reducedRequired");
  assert.equal(validateFractionAdditionAnswer(task, "  2   2/5 ").isCorrect, true);
  assert.equal(validateFractionAdditionAnswer(task, "2 2 / 5").isCorrect, true);
});

function missingNumeratorTask(
  denominator: number,
  known: number,
  missing: number,
): FractionAdditionMissingNumeratorTask {
  return {
    kind: "missingNumerator",
    topic: "fraction-addition-same-denominator",
    operation: "addition",
    difficulty: 5,
    denominator,
    knownOperand: { numerator: known, denominator },
    unknownOperandPosition: "first",
    result: { numerator: known + missing, denominator },
    missingNumerator: missing,
  };
}

// ?/11 + 4/11 = 9/11 -> missing numerator is 5.
test("missingNumerator: accepts the correct integer", () => {
  const task = missingNumeratorTask(11, 4, 5);
  const result = validateFractionAdditionAnswer(task, "5");
  assert.equal(result.isCorrect, true);
  assert.equal(result.reason, "correct");
});

test("missingNumerator: rejects a wrong integer", () => {
  const task = missingNumeratorTask(11, 4, 5);
  const result = validateFractionAdditionAnswer(task, "6");
  assert.equal(result.isCorrect, false);
  assert.equal(result.reason, "notMathematicallyEquivalent");
});

test("missingNumerator: rejects a fraction-shaped answer as invalid format", () => {
  const task = missingNumeratorTask(11, 4, 5);
  const result = validateFractionAdditionAnswer(task, "5/11");
  assert.equal(result.isCorrect, false);
  assert.equal(result.reason, "invalidFormat");
});
