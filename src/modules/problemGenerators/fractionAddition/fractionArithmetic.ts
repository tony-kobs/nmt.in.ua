/**
 * Exact integer fraction arithmetic. No floating-point math is used anywhere
 * here — equality and reduction rely solely on integer gcd / cross-multiply,
 * so results are deterministic and exactly verifiable.
 */

export type Fraction = {
  numerator: number;
  denominator: number;
};

export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const remainder = x % y;
    x = y;
    y = remainder;
  }
  return x;
}

export function reduceFraction(fraction: Fraction): Fraction {
  const divisor = gcd(fraction.numerator, fraction.denominator) || 1;
  return {
    numerator: fraction.numerator / divisor,
    denominator: fraction.denominator / divisor,
  };
}

/** Sums fractions that all share one denominator. Throws on empty input or a
 * denominator mismatch — same-denominator addition is this module's only
 * supported operation. */
export function addFractionsSameDenominator(
  fractions: readonly Fraction[],
): Fraction {
  if (fractions.length === 0) {
    throw new Error("addFractionsSameDenominator requires at least one fraction.");
  }
  const denominator = fractions[0].denominator;
  if (!fractions.every((fraction) => fraction.denominator === denominator)) {
    throw new Error("All fractions must share the same denominator.");
  }
  const numerator = fractions.reduce((sum, fraction) => sum + fraction.numerator, 0);
  return { numerator, denominator };
}

/** Value equality across differing denominators, via cross-multiplication —
 * never divides, so it stays exact for any integer inputs. */
export function fractionsEqual(a: Fraction, b: Fraction): boolean {
  return a.numerator * b.denominator === b.numerator * a.denominator;
}

export type MixedNumber = {
  whole: number;
  numerator: number;
  denominator: number;
};

export type FractionSumBreakdown = {
  /** Raw `numerator/denominator` sum, before any reduction. */
  unreduced: Fraction;
  /** Fully reduced (`gcd(numerator, denominator) === 1`), still possibly improper. */
  reduced: Fraction;
  /** True when `reduced` differs from `unreduced` — the sum was reducible. */
  requiresReduction: boolean;
  /** True when the value is >= 1 (`reduced.numerator >= reduced.denominator`). */
  isImproper: boolean;
  /** Set when the reduced value is an exact whole number. */
  whole: number | null;
  /** Set when the value is improper but not an exact whole number. */
  mixed: MixedNumber | null;
};

export function describeFractionSum(unreduced: Fraction): FractionSumBreakdown {
  const reduced = reduceFraction(unreduced);
  const requiresReduction = reduced.denominator !== unreduced.denominator;
  const isImproper = reduced.numerator >= reduced.denominator;
  const whole =
    isImproper && reduced.numerator % reduced.denominator === 0
      ? reduced.numerator / reduced.denominator
      : null;
  const mixed =
    isImproper && whole === null
      ? {
          whole: Math.floor(reduced.numerator / reduced.denominator),
          numerator: reduced.numerator % reduced.denominator,
          denominator: reduced.denominator,
        }
      : null;
  return { unreduced, reduced, requiresReduction, isImproper, whole, mixed };
}

export function formatFraction(fraction: Fraction): string {
  return `${fraction.numerator}/${fraction.denominator}`;
}

/** Canonical human-readable form of a sum: whole number, mixed number, or
 * reduced fraction — whichever applies. Convenience for UI/tests; the
 * structured `FractionSumBreakdown` remains the source of truth. */
export function formatCanonicalAnswer(breakdown: FractionSumBreakdown): string {
  if (breakdown.whole !== null) return String(breakdown.whole);
  if (breakdown.mixed !== null) {
    return `${breakdown.mixed.whole} ${breakdown.mixed.numerator}/${breakdown.mixed.denominator}`;
  }
  return formatFraction(breakdown.reduced);
}
