import assert from "node:assert/strict";
import test from "node:test";
import {
  addFractionsSameDenominator,
  describeFractionSum,
  formatCanonicalAnswer,
  formatFraction,
  fractionsEqual,
  gcd,
  reduceFraction,
} from "./fractionArithmetic";

test("gcd handles the basic cases", () => {
  assert.equal(gcd(4, 8), 4);
  assert.equal(gcd(7, 11), 1);
  assert.equal(gcd(0, 5), 5);
  assert.equal(gcd(5, 0), 5);
  assert.equal(gcd(12, 18), 6);
});

test("reduceFraction divides out the greatest common divisor", () => {
  assert.deepEqual(reduceFraction({ numerator: 4, denominator: 8 }), {
    numerator: 1,
    denominator: 2,
  });
  assert.deepEqual(reduceFraction({ numerator: 5, denominator: 7 }), {
    numerator: 5,
    denominator: 7,
  });
  assert.deepEqual(reduceFraction({ numerator: 0, denominator: 5 }), {
    numerator: 0,
    denominator: 1,
  });
});

test("addFractionsSameDenominator sums numerators and keeps the denominator", () => {
  const result = addFractionsSameDenominator([
    { numerator: 2, denominator: 7 },
    { numerator: 3, denominator: 7 },
  ]);
  assert.deepEqual(result, { numerator: 5, denominator: 7 });
});

test("addFractionsSameDenominator supports three or more operands", () => {
  const result = addFractionsSameDenominator([
    { numerator: 2, denominator: 9 },
    { numerator: 4, denominator: 9 },
    { numerator: 1, denominator: 9 },
  ]);
  assert.deepEqual(result, { numerator: 7, denominator: 9 });
});

test("addFractionsSameDenominator rejects a denominator mismatch", () => {
  assert.throws(() =>
    addFractionsSameDenominator([
      { numerator: 1, denominator: 3 },
      { numerator: 1, denominator: 4 },
    ]),
  );
});

test("addFractionsSameDenominator rejects empty input", () => {
  assert.throws(() => addFractionsSameDenominator([]));
});

test("fractionsEqual recognizes equivalent fractions across denominators", () => {
  assert.equal(fractionsEqual({ numerator: 4, denominator: 8 }, { numerator: 1, denominator: 2 }), true);
  assert.equal(fractionsEqual({ numerator: 2, denominator: 3 }, { numerator: 3, denominator: 4 }), false);
});

test("describeFractionSum: proper, irreducible result", () => {
  const breakdown = describeFractionSum({ numerator: 5, denominator: 7 });
  assert.deepEqual(breakdown.reduced, { numerator: 5, denominator: 7 });
  assert.equal(breakdown.requiresReduction, false);
  assert.equal(breakdown.isImproper, false);
  assert.equal(breakdown.whole, null);
  assert.equal(breakdown.mixed, null);
});

test("describeFractionSum: reducible proper result (3/8 + 1/8 = 4/8 = 1/2)", () => {
  const breakdown = describeFractionSum({ numerator: 4, denominator: 8 });
  assert.deepEqual(breakdown.reduced, { numerator: 1, denominator: 2 });
  assert.equal(breakdown.requiresReduction, true);
  assert.equal(breakdown.isImproper, false);
  assert.equal(breakdown.whole, null);
  assert.equal(breakdown.mixed, null);
});

test("describeFractionSum: improper result that reduces to a whole number (14/7 = 2)", () => {
  const breakdown = describeFractionSum({ numerator: 14, denominator: 7 });
  assert.equal(breakdown.isImproper, true);
  assert.equal(breakdown.whole, 2);
  assert.equal(breakdown.mixed, null);
});

test("describeFractionSum: improper result as a mixed number (12/5 = 2 2/5)", () => {
  const breakdown = describeFractionSum({ numerator: 12, denominator: 5 });
  assert.equal(breakdown.requiresReduction, false);
  assert.equal(breakdown.isImproper, true);
  assert.equal(breakdown.whole, null);
  assert.deepEqual(breakdown.mixed, { whole: 2, numerator: 2, denominator: 5 });
});

test("formatFraction and formatCanonicalAnswer", () => {
  assert.equal(formatFraction({ numerator: 5, denominator: 7 }), "5/7");
  assert.equal(formatCanonicalAnswer(describeFractionSum({ numerator: 5, denominator: 7 })), "5/7");
  assert.equal(formatCanonicalAnswer(describeFractionSum({ numerator: 14, denominator: 7 })), "2");
  assert.equal(formatCanonicalAnswer(describeFractionSum({ numerator: 12, denominator: 5 })), "2 2/5");
  assert.equal(formatCanonicalAnswer(describeFractionSum({ numerator: 4, denominator: 8 })), "1/2");
});
