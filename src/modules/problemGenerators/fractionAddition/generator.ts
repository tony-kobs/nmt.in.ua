/**
 * Generator for "addition of fractions with the same denominator" — five
 * difficulty levels, all sharing the constraint that every operand (and the
 * result) keeps one common denominator. No AI/LLM involved: every task is
 * built and checked with exact integer arithmetic (`fractionArithmetic.ts`).
 *
 * Level 1: two proper fractions, small numerators, proper result, no
 *          reduction possible by construction.
 * Level 2: larger numerators (still proper operands); result may be
 *          improper; still no reduction possible by construction.
 * Level 3: proper operands and a proper result that is always reducible.
 * Level 4: proper operands whose sum is always improper (may also reduce);
 *          expects conversion to a whole/mixed number.
 * Level 5: either three operands, or a missing-numerator equation
 *          (`?/d + b/d = r/d`), while staying same-denominator addition.
 */

import {
  addFractionsSameDenominator,
  describeFractionSum,
  gcd,
} from "./fractionArithmetic";
import { createSeededRandom, pickRandom, randomInt, type RandomSource } from "./rng";
import type {
  FractionAdditionAcceptRule,
  FractionAdditionDifficulty,
  FractionAdditionMissingNumeratorTask,
  FractionAdditionSumTask,
  FractionAdditionTask,
} from "./types";

export const MIN_DENOMINATOR = 4;
export const MAX_DENOMINATOR = 12;

export type FractionAdditionLevel5SubKind = "sum" | "missingNumerator";

export type GenerateFractionAdditionOptions = {
  level: FractionAdditionDifficulty;
  /** Injected RNG — use `createSeededRandom` in tests for reproducibility. */
  rng?: RandomSource;
  /** Convenience alternative to `rng`: seeds a deterministic RNG. */
  seed?: number;
  /** Level 5 only. Omit to pick randomly between the two sub-kinds. */
  subKind?: FractionAdditionLevel5SubKind;
};

function isPrime(value: number): boolean {
  if (value < 2) return false;
  for (let divisor = 2; divisor * divisor <= value; divisor += 1) {
    if (value % divisor === 0) return false;
  }
  return true;
}

function denominatorRange(): number[] {
  const range: number[] = [];
  for (let d = MIN_DENOMINATOR; d <= MAX_DENOMINATOR; d += 1) range.push(d);
  return range;
}

const ALL_DENOMINATORS = denominatorRange();
const COMPOSITE_DENOMINATORS = ALL_DENOMINATORS.filter((d) => !isPrime(d));

/** Sums `sMin..sMax` (inclusive) whose gcd with `denominator` matches the
 * given predicate ("=== 1" for irreducible, "> 1" for reducible). */
function sumsInRangeMatching(
  denominator: number,
  sMin: number,
  sMax: number,
  predicate: (sharedFactor: number) => boolean,
): number[] {
  const candidates: number[] = [];
  for (let s = sMin; s <= sMax; s += 1) {
    if (predicate(gcd(s, denominator))) candidates.push(s);
  }
  return candidates;
}

/** Splits a target sum `s` into two positive operands, each `< denominator`. */
function splitIntoTwoOperands(
  rng: RandomSource,
  denominator: number,
  s: number,
): [number, number] {
  const aMin = Math.max(1, s - (denominator - 1));
  const aMax = Math.min(denominator - 1, s - 1);
  const a = randomInt(rng, aMin, aMax);
  return [a, s - a];
}

function buildSumTask(
  difficulty: FractionAdditionDifficulty,
  denominator: number,
  numerators: number[],
  acceptRule: FractionAdditionAcceptRule,
): FractionAdditionSumTask {
  const operands = numerators.map((numerator) => ({ numerator, denominator }));
  const unreduced = addFractionsSameDenominator(operands);
  const breakdown = describeFractionSum(unreduced);
  return {
    kind: "sum",
    topic: "fraction-addition-same-denominator",
    operation: "addition",
    difficulty,
    denominator,
    operands,
    answer: { ...breakdown, acceptRule },
  };
}

/** Level 1: proper operands, proper (< 1) result, irreducible by construction. */
function generateLevel1(rng: RandomSource): FractionAdditionSumTask {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const denominator = pickRandom(rng, ALL_DENOMINATORS);
    const candidates = sumsInRangeMatching(denominator, 2, denominator - 1, (g) => g === 1);
    if (candidates.length === 0) continue;
    const sum = pickRandom(rng, candidates);
    const [a, b] = splitIntoTwoOperands(rng, denominator, sum);
    return buildSumTask(1, denominator, [a, b], "anyEquivalent");
  }
  throw new Error("generateLevel1: failed to find a valid denominator/sum pair.");
}

/** Level 2: proper operands, larger numerators, result may be improper,
 * still irreducible by construction (reduction is level 3's concern). */
function generateLevel2(rng: RandomSource): FractionAdditionSumTask {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const denominator = pickRandom(rng, ALL_DENOMINATORS);
    const sMin = Math.max(2, denominator - 2);
    const sMax = 2 * (denominator - 1);
    let candidates = sumsInRangeMatching(denominator, sMin, sMax, (g) => g === 1);
    if (candidates.length === 0) {
      candidates = sumsInRangeMatching(denominator, 2, sMax, (g) => g === 1);
    }
    if (candidates.length === 0) continue;
    const sum = pickRandom(rng, candidates);
    const [a, b] = splitIntoTwoOperands(rng, denominator, sum);
    return buildSumTask(2, denominator, [a, b], "anyEquivalent");
  }
  throw new Error("generateLevel2: failed to find a valid denominator/sum pair.");
}

/** Level 3: proper operands, proper result that is always reducible. Needs a
 * composite denominator — a prime denominator has no reducible proper sum. */
function generateLevel3(rng: RandomSource): FractionAdditionSumTask {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const denominator = pickRandom(rng, COMPOSITE_DENOMINATORS);
    const candidates = sumsInRangeMatching(denominator, 2, denominator - 1, (g) => g > 1);
    if (candidates.length === 0) continue;
    const sum = pickRandom(rng, candidates);
    const [a, b] = splitIntoTwoOperands(rng, denominator, sum);
    return buildSumTask(3, denominator, [a, b], "reducedRequired");
  }
  throw new Error("generateLevel3: failed to find a valid denominator/sum pair.");
}

/** Level 4: proper operands whose sum is always improper (>= denominator);
 * reduction may or may not additionally apply. */
function generateLevel4(rng: RandomSource): FractionAdditionSumTask {
  const denominator = pickRandom(rng, ALL_DENOMINATORS);
  const sum = randomInt(rng, denominator, 2 * (denominator - 1));
  const [a, b] = splitIntoTwoOperands(rng, denominator, sum);
  return buildSumTask(4, denominator, [a, b], "reducedRequired");
}

/** Level 5, "sum" sub-kind: three operands, same denominator. */
function generateLevel5Sum(rng: RandomSource): FractionAdditionSumTask {
  const denominator = pickRandom(rng, ALL_DENOMINATORS);
  const numerators = [
    randomInt(rng, 1, denominator - 1),
    randomInt(rng, 1, denominator - 1),
    randomInt(rng, 1, denominator - 1),
  ];
  return buildSumTask(5, denominator, numerators, "reducedRequired");
}

/** Level 5, "missingNumerator" sub-kind: `?/d + b/d = r/d` (proper result). */
function generateLevel5MissingNumerator(
  rng: RandomSource,
): FractionAdditionMissingNumeratorTask {
  const denominator = pickRandom(rng, ALL_DENOMINATORS);
  const known = randomInt(rng, 1, denominator - 2);
  const missing = randomInt(rng, 1, denominator - 1 - known);
  const resultNumerator = known + missing;
  const unknownOperandPosition = pickRandom(rng, ["first", "second"] as const);
  return {
    kind: "missingNumerator",
    topic: "fraction-addition-same-denominator",
    operation: "addition",
    difficulty: 5,
    denominator,
    knownOperand: { numerator: known, denominator },
    unknownOperandPosition,
    result: { numerator: resultNumerator, denominator },
    missingNumerator: missing,
  };
}

export function generateFractionAdditionTask(
  options: GenerateFractionAdditionOptions,
): FractionAdditionTask {
  const rng: RandomSource =
    options.rng ?? (options.seed != null ? createSeededRandom(options.seed) : Math.random);

  switch (options.level) {
    case 1:
      return generateLevel1(rng);
    case 2:
      return generateLevel2(rng);
    case 3:
      return generateLevel3(rng);
    case 4:
      return generateLevel4(rng);
    case 5: {
      const subKind = options.subKind ?? pickRandom(rng, ["sum", "missingNumerator"] as const);
      return subKind === "sum" ? generateLevel5Sum(rng) : generateLevel5MissingNumerator(rng);
    }
    default: {
      const exhaustive: never = options.level;
      throw new Error(`generateFractionAdditionTask: unsupported level ${String(exhaustive)}`);
    }
  }
}
