/**
 * Adaptive difficulty for Practice mode. Pure rules only — the DB-backed
 * task pick lives in `pickPracticeFollowUpTask.ts`.
 */

/** Consecutive-correct threshold before task selection starts preferring a
 * harder follow-up task (spec: "after 2-3 consecutive correct answers").
 * Picked the upper bound so a single lucky guess right after a miss doesn't
 * already tip the difficulty up. */
export const ADAPTIVE_STREAK_THRESHOLD = 3;

/** Verified bounds for `quiz_tasks.difficulty` (see
 * `content-import/schema.ts` MIN_DIFFICULTY/MAX_DIFFICULTY — duplicated
 * here rather than importing the content-import module into testing). */
export const MIN_TASK_DIFFICULTY = 1;
export const MAX_TASK_DIFFICULTY = 3;

function isValidDifficulty(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_TASK_DIFFICULTY &&
    value <= MAX_TASK_DIFFICULTY
  );
}

/** `correct` extends the streak; anything else resets it to 0. */
export function nextPracticeStreak(streak: number, correct: boolean): number {
  return correct ? streak + 1 : 0;
}

/**
 * Pure adaptive-difficulty rule: once the streak reaches
 * `ADAPTIVE_STREAK_THRESHOLD`, prefer a task one difficulty tier harder than
 * the one just answered (capped at `MAX_TASK_DIFFICULTY` — never invents a
 * level outside the schema's verified 1-3 range). Returns `null` — "no
 * preference, pick randomly within the theme" — below the threshold, or
 * when the source task's difficulty is missing/out of range, so a legacy
 * row without usable difficulty data never fabricates one.
 */
export function resolvePreferredDifficulty(
  currentDifficulty: unknown,
  streak: number,
): number | null {
  if (!isValidDifficulty(currentDifficulty)) return null;
  if (streak < ADAPTIVE_STREAK_THRESHOLD) return null;
  return Math.min(currentDifficulty + 1, MAX_TASK_DIFFICULTY);
}
