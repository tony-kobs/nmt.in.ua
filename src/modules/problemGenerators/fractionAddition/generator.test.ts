import assert from "node:assert/strict";
import test from "node:test";
import { addFractionsSameDenominator, gcd } from "./fractionArithmetic";
import { generateFractionAdditionTask, MAX_DENOMINATOR, MIN_DENOMINATOR } from "./generator";
import { createSeededRandom } from "./rng";
import type { FractionAdditionSumTask } from "./types";

/** Fixed seed pool — deterministic, exercises many denominators/sums without
 * ever depending on wall-clock randomness (no flakiness). */
const SEEDS = Array.from({ length: 40 }, (_, i) => i * 1000 + 1);

function generateMany(level: 1 | 2 | 3 | 4 | 5, subKind?: "sum" | "missingNumerator") {
  return SEEDS.map((seed) =>
    generateFractionAdditionTask({ level, seed, ...(subKind ? { subKind } : {}) }),
  );
}

test("same denominator is preserved across all operands and the result", () => {
  for (const level of [1, 2, 3, 4, 5] as const) {
    for (const task of generateMany(level)) {
      if (task.kind === "sum") {
        for (const operand of task.operands) {
          assert.equal(operand.denominator, task.denominator);
        }
        assert.equal(task.answer.unreduced.denominator, task.denominator);
      } else {
        assert.equal(task.knownOperand.denominator, task.denominator);
        assert.equal(task.result.denominator, task.denominator);
      }
    }
  }
});

test("denominators stay within the documented range", () => {
  for (const level of [1, 2, 3, 4, 5] as const) {
    for (const task of generateMany(level)) {
      assert.ok(task.denominator >= MIN_DENOMINATOR);
      assert.ok(task.denominator <= MAX_DENOMINATOR);
    }
  }
});

test("generated sums are mathematically correct (re-derived independently)", () => {
  for (const level of [1, 2, 3, 4] as const) {
    for (const task of generateMany(level) as FractionAdditionSumTask[]) {
      const recomputed = addFractionsSameDenominator(task.operands);
      assert.deepEqual(recomputed, task.answer.unreduced);
      // reduced form must be an exact gcd-1 reduction of the unreduced sum
      const g = gcd(recomputed.numerator, recomputed.denominator);
      assert.deepEqual(task.answer.reduced, {
        numerator: recomputed.numerator / g,
        denominator: recomputed.denominator / g,
      });
    }
  }
});

test("level 1: two proper fractions, small numerators, proper (< 1) result, no reduction", () => {
  for (const task of generateMany(1) as FractionAdditionSumTask[]) {
    assert.equal(task.operands.length, 2);
    for (const operand of task.operands) {
      assert.ok(operand.numerator >= 1, "numerator must be positive");
      assert.ok(operand.numerator < task.denominator, "operand must be proper");
    }
    assert.ok(task.answer.unreduced.numerator < task.denominator, "result must be proper");
    assert.equal(task.answer.requiresReduction, false);
    assert.equal(task.answer.isImproper, false);
    assert.equal(task.answer.acceptRule, "anyEquivalent");
  }
});

test("level 2: proper operands, no forced reduction, result may be improper", () => {
  let sawImproper = false;
  for (const task of generateMany(2) as FractionAdditionSumTask[]) {
    assert.equal(task.operands.length, 2);
    for (const operand of task.operands) {
      assert.ok(operand.numerator >= 1);
      assert.ok(operand.numerator < task.denominator, "operand must be proper");
    }
    assert.equal(task.answer.requiresReduction, false);
    if (task.answer.isImproper) sawImproper = true;
  }
  assert.ok(sawImproper, "level 2 should produce at least one improper result across many seeds");
});

test("level 3: proper result that always requires reduction", () => {
  for (const task of generateMany(3) as FractionAdditionSumTask[]) {
    assert.equal(task.operands.length, 2);
    assert.ok(task.answer.unreduced.numerator < task.denominator, "result must stay proper");
    assert.equal(task.answer.requiresReduction, true);
    assert.equal(task.answer.isImproper, false);
    assert.equal(task.answer.acceptRule, "reducedRequired");
    assert.notDeepEqual(task.answer.reduced, task.answer.unreduced);
  }
});

test("level 4: improper result, may need reduction, converts to whole/mixed", () => {
  let sawWhole = false;
  let sawMixed = false;
  for (const task of generateMany(4) as FractionAdditionSumTask[]) {
    assert.equal(task.operands.length, 2);
    assert.ok(task.answer.unreduced.numerator >= task.denominator, "result must be improper");
    assert.equal(task.answer.isImproper, true);
    assert.equal(task.answer.acceptRule, "reducedRequired");
    if (task.answer.whole !== null) sawWhole = true;
    if (task.answer.mixed !== null) sawMixed = true;
  }
  assert.ok(sawWhole, "level 4 should produce at least one exact-whole-number result");
  assert.ok(sawMixed, "level 4 should produce at least one mixed-number result");
});

test("level 5 'sum' sub-kind: three operands, same denominator", () => {
  for (const task of generateMany(5, "sum") as FractionAdditionSumTask[]) {
    assert.equal(task.kind, "sum");
    assert.equal(task.operands.length, 3);
    for (const operand of task.operands) {
      assert.ok(operand.numerator >= 1);
      assert.ok(operand.numerator < task.denominator);
    }
  }
});

test("level 5 'missingNumerator' sub-kind: ?/d + b/d = r/d, proper result", () => {
  for (const task of generateMany(5, "missingNumerator")) {
    assert.equal(task.kind, "missingNumerator");
    if (task.kind !== "missingNumerator") continue;
    assert.ok(task.missingNumerator >= 1);
    assert.ok(task.knownOperand.numerator >= 1);
    assert.ok(task.result.numerator < task.denominator, "result must be proper");
    assert.equal(task.knownOperand.numerator + task.missingNumerator, task.result.numerator);
    assert.ok(["first", "second"].includes(task.unknownOperandPosition));
  }
});

test("level 5 without an explicit subKind covers both sub-kinds over many seeds", () => {
  const kinds = new Set(generateMany(5).map((task) => task.kind));
  assert.deepEqual(kinds, new Set(["sum", "missingNumerator"]));
});

test("generation never produces a zero numerator", () => {
  for (const level of [1, 2, 3, 4, 5] as const) {
    for (const task of generateMany(level)) {
      if (task.kind === "sum") {
        for (const operand of task.operands) assert.notEqual(operand.numerator, 0);
      } else {
        assert.notEqual(task.knownOperand.numerator, 0);
        assert.notEqual(task.missingNumerator, 0);
      }
    }
  }
});

test("generation is reproducible for a fixed seed", () => {
  const a = generateFractionAdditionTask({ level: 3, seed: 777 });
  const b = generateFractionAdditionTask({ level: 3, seed: 777 });
  assert.deepEqual(a, b);
});

test("an injected rng instance produces the same task as an equivalent seed", () => {
  const a = generateFractionAdditionTask({ level: 4, rng: createSeededRandom(55) });
  const b = generateFractionAdditionTask({ level: 4, seed: 55 });
  assert.deepEqual(a, b);
});
