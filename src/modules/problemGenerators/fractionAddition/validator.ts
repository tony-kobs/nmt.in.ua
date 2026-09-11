/**
 * Answer validator for generated fraction-addition tasks. Pure function, no
 * UI/DB dependency — the caller passes the task object produced by the
 * generator plus the raw text the student typed.
 */

import { fractionsEqual, type Fraction } from "./fractionArithmetic";
import type { FractionAdditionAnswer, FractionAdditionTask } from "./types";

/** The parsed answer keeps its written shape (not just its numeric value) —
 * "12/5" and "2 2/5" have the same value but are different shapes, and the
 * canonical-form check below must tell them apart. */
type ParsedAnswer =
  | { shape: "whole"; value: number }
  | { shape: "fraction"; numerator: number; denominator: number }
  | { shape: "mixed"; whole: number; numerator: number; denominator: number };

export type FractionAdditionValidationReason =
  | "correct"
  | "invalidFormat"
  | "notMathematicallyEquivalent"
  | "reductionRequired";

export type FractionAdditionValidationResult = {
  isCorrect: boolean;
  /** True whenever the parsed answer has the right numeric value, even if
   * `isCorrect` is false because the task requires the canonical form. */
  isMathematicallyEquivalent: boolean;
  reason: FractionAdditionValidationReason;
};

const MIXED_NUMBER_PATTERN = /^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/;
const FRACTION_PATTERN = /^(-?\d+)\s*\/\s*(\d+)$/;
const WHOLE_NUMBER_PATTERN = /^-?\d+$/;

/** Accepts "5/7", "2 2/5" (mixed), or "2" (whole) — nothing else. */
function parseFractionAnswer(raw: string): ParsedAnswer | null {
  const text = raw.trim();
  if (text.length === 0) return null;

  const mixedMatch = text.match(MIXED_NUMBER_PATTERN);
  if (mixedMatch) {
    const whole = Number(mixedMatch[1]);
    const numerator = Number(mixedMatch[2]);
    const denominator = Number(mixedMatch[3]);
    if (denominator === 0) return null;
    return { shape: "mixed", whole, numerator, denominator };
  }

  const fractionMatch = text.match(FRACTION_PATTERN);
  if (fractionMatch) {
    const denominator = Number(fractionMatch[2]);
    if (denominator === 0) return null;
    return { shape: "fraction", numerator: Number(fractionMatch[1]), denominator };
  }

  if (WHOLE_NUMBER_PATTERN.test(text)) {
    return { shape: "whole", value: Number(text) };
  }

  return null;
}

function toFraction(parsed: ParsedAnswer): Fraction {
  if (parsed.shape === "whole") return { numerator: parsed.value, denominator: 1 };
  if (parsed.shape === "fraction") {
    return { numerator: parsed.numerator, denominator: parsed.denominator };
  }
  const sign = parsed.whole < 0 ? -1 : 1;
  return {
    numerator: parsed.whole * parsed.denominator + sign * parsed.numerator,
    denominator: parsed.denominator,
  };
}

function parseIntegerAnswer(raw: string): number | null {
  const text = raw.trim();
  if (!WHOLE_NUMBER_PATTERN.test(text)) return null;
  return Number(text);
}

/** Checks the written *shape* against the task's canonical form — a value
 * match alone isn't enough: "12/5" must not pass for a task whose canonical
 * answer is the mixed number "2 2/5", even though both equal 12/5. */
function isCanonicalReducedForm(parsed: ParsedAnswer, answer: FractionAdditionAnswer): boolean {
  if (answer.whole !== null) {
    return parsed.shape === "whole" && parsed.value === answer.whole;
  }
  if (answer.mixed !== null) {
    return (
      parsed.shape === "mixed" &&
      parsed.whole === answer.mixed.whole &&
      parsed.numerator === answer.mixed.numerator &&
      parsed.denominator === answer.mixed.denominator
    );
  }
  return (
    parsed.shape === "fraction" &&
    parsed.numerator === answer.reduced.numerator &&
    parsed.denominator === answer.reduced.denominator
  );
}

export function validateFractionAdditionAnswer(
  task: FractionAdditionTask,
  rawAnswer: string,
): FractionAdditionValidationResult {
  if (task.kind === "missingNumerator") {
    const parsed = parseIntegerAnswer(rawAnswer);
    if (parsed === null) {
      return { isCorrect: false, isMathematicallyEquivalent: false, reason: "invalidFormat" };
    }
    const correct = parsed === task.missingNumerator;
    return {
      isCorrect: correct,
      isMathematicallyEquivalent: correct,
      reason: correct ? "correct" : "notMathematicallyEquivalent",
    };
  }

  const parsed = parseFractionAnswer(rawAnswer);
  if (parsed === null) {
    return { isCorrect: false, isMathematicallyEquivalent: false, reason: "invalidFormat" };
  }

  const isMathematicallyEquivalent = fractionsEqual(toFraction(parsed), task.answer.unreduced);
  if (!isMathematicallyEquivalent) {
    return { isCorrect: false, isMathematicallyEquivalent: false, reason: "notMathematicallyEquivalent" };
  }

  if (task.answer.acceptRule === "anyEquivalent") {
    return { isCorrect: true, isMathematicallyEquivalent: true, reason: "correct" };
  }

  const isCanonical = isCanonicalReducedForm(parsed, task.answer);
  return {
    isCorrect: isCanonical,
    isMathematicallyEquivalent: true,
    reason: isCanonical ? "correct" : "reductionRequired",
  };
}
