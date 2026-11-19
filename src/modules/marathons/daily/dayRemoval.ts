/** Compact the days that remain after one day is removed. Order is kept. */

export type DayMove = { from: number; to: number };

/** How many bank tasks one day can hold. Matches the manual order field (1–50). */
export const DAY_BLOCK_MAX = 50;

export function planDayRemoval(
  dayNumbers: readonly number[],
  removed: number,
): DayMove[] {
  return dayNumbers
    .filter((day) => day !== removed)
    .slice()
    .sort((left, right) => left - right)
    .map((from, index) => ({ from, to: index + 1 }));
}

/**
 * A day counts as having student work when it was submitted or already holds
 * saved answers. Opening the materials alone does not.
 */
export const DAY_HAS_ANSWERS_SQL =
  "(completed_at IS NOT NULL OR (answers_json IS NOT NULL AND CHAR_LENGTH(answers_json) > 2))";
