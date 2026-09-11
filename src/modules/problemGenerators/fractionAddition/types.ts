import type { Fraction, FractionSumBreakdown } from "./fractionArithmetic";

/** Difficulty progression for "addition of fractions with the same
 * denominator" — see module README-level comment in `generator.ts`. */
export type FractionAdditionDifficulty = 1 | 2 | 3 | 4 | 5;

/**
 * Explicit, per-task policy for what the validator accepts — set by the
 * generator, never decided by the UI:
 * - "anyEquivalent": any mathematically equal fraction is correct (levels
 *   where reduction isn't the point, so unreduced === reduced anyway).
 * - "reducedRequired": the submitted answer must literally be the canonical
 *   form (whole number / mixed number / lowest-terms fraction), not merely
 *   an equivalent fraction — e.g. "4/8" is rejected when the canonical
 *   answer is "1/2".
 */
export type FractionAdditionAcceptRule = "reducedRequired" | "anyEquivalent";

export type FractionAdditionAnswer = FractionSumBreakdown & {
  acceptRule: FractionAdditionAcceptRule;
};

/** "compute the sum" task — levels 1-4, and the three-operand level 5 variant. */
export type FractionAdditionSumTask = {
  kind: "sum";
  topic: "fraction-addition-same-denominator";
  operation: "addition";
  difficulty: FractionAdditionDifficulty;
  denominator: number;
  operands: Fraction[];
  answer: FractionAdditionAnswer;
};

/** "find the missing numerator" task — the other level 5 variant, e.g.
 * `?/11 + 4/11 = 9/11`. */
export type FractionAdditionMissingNumeratorTask = {
  kind: "missingNumerator";
  topic: "fraction-addition-same-denominator";
  operation: "addition";
  difficulty: 5;
  denominator: number;
  knownOperand: Fraction;
  unknownOperandPosition: "first" | "second";
  result: Fraction;
  missingNumerator: number;
};

export type FractionAdditionTask =
  | FractionAdditionSumTask
  | FractionAdditionMissingNumeratorTask;
