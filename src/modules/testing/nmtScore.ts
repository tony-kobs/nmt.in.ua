/**
 * Official NMT 2026 maths scoring (УЦОЯО):
 * single choice — 1 point, each correct matching pair — 1 point,
 * short open answer — 2 points. A full 22-task paper maxes at 32.
 * A shorter paper (for example 2022, 20 tasks) uses the same rules
 * and its own maximum: nothing here assumes 22 tasks.
 *
 * Characteristic: https://testportal.gov.ua/matematyka-2026/
 * PDF: https://testportal.gov.ua/wp-content/uploads/2026/01/Harakterystyka-NMT_matematyka_2026.pdf
 */
export const NMT_PASS_TEST_POINTS = 5;

/**
 * Наказ МОН від 26.02.2026 № 373, додаток 5, таблиця 2
 * «Таблиця переведення тестових балів тесту з математики НМТ до шкали 100–200».
 * https://testportal.gov.ua/wp-content/uploads/2026/03/nakaz-MON-vid-26.02.2026_373.pdf
 * (також https://zakon.rada.gov.ua/go/z0374-26).
 * Бали 0–4 у таблиці відсутні: рейтингова шкала починається з порога 5.
 * Таблиця складена для роботи з максимумом 32. Для варіанта з іншим
 * максимумом шкалу не підставляємо.
 */
export const NMT_MATH_SCALE_2026: Readonly<Record<number, number>> = {
  5: 100,
  6: 108,
  7: 115,
  8: 123,
  9: 131,
  10: 134,
  11: 137,
  12: 140,
  13: 143,
  14: 145,
  15: 147,
  16: 148,
  17: 149,
  18: 150,
  19: 151,
  20: 152,
  21: 155,
  22: 159,
  23: 163,
  24: 167,
  25: 170,
  26: 173,
  27: 176,
  28: 180,
  29: 184,
  30: 189,
  31: 194,
  32: 200,
};

export const NMT_SCALE_PAPER_MAX = 32;

export type NmtScoreKind = "mcq" | "match" | "open";

export type NmtScoreTask = {
  kind: NmtScoreKind;
  /** Whole task marked correct. Used when pair text was not stored. */
  correct?: boolean;
  /** Points already stored for this answer, including partial pairs. */
  awardedPoints?: number | null;
  answerText?: string | null;
  keyText?: string | null;
};

export type NmtPaperScore = {
  testPoints: number;
  maxTestPoints: number;
  /** 100–200 only for a 32-point paper at or above the pass threshold. */
  scaleScore: number | null;
  passed: boolean;
};

const PAIR = /(\d)([a-e])/g;

const MATCH_CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "c",
  г: "d",
  д: "e",
};

/** Same letter fold as `normalizeAnswerText`: the bank stores `1b`, the card shows Б. */
export function foldMatchAnswer(value: string): string {
  const compact = value.trim().toLowerCase().replace(/\s+/g, "");
  return compact.replace(/(\d)([абвгд])/g, (full, digit: string, letter: string) => {
    const latin = MATCH_CYRILLIC_TO_LATIN[letter];
    return latin ? `${digit}${latin}` : full;
  });
}

export function matchPairs(value: string): Map<string, string> {
  const pairs = new Map<string, string>();
  const normalized = foldMatchAnswer(value);
  for (const match of normalized.matchAll(PAIR)) {
    pairs.set(match[1] ?? "", match[2] ?? "");
  }
  return pairs;
}

/** How many pairs the key defines. Official matching tasks have three. */
export function matchMaxPoints(keyText: string | null | undefined): number {
  if (!keyText?.trim()) return 3;
  const count = matchPairs(keyText).size;
  return count > 0 ? count : 3;
}

export function scoreMatchPairs(
  keyText: string,
  answerText: string,
): { earned: number; max: number } {
  const key = matchPairs(keyText);
  const answer = matchPairs(answerText);
  let earned = 0;
  for (const [row, letter] of key) {
    if (answer.get(row) === letter) earned += 1;
  }
  return { earned, max: key.size > 0 ? key.size : 3 };
}

export function maxPointsForTask(task: NmtScoreTask): number {
  if (task.kind === "open") return 2;
  if (task.kind === "match") return matchMaxPoints(task.keyText);
  return 1;
}

function clampPoints(value: number, max: number): number {
  if (!Number.isInteger(value) || value < 0) return 0;
  return Math.min(value, max);
}

/** Points for one task. Matching can be 0, 1, 2 or 3. */
export function pointsForNmtTask(task: NmtScoreTask): number {
  const max = maxPointsForTask(task);
  if (task.awardedPoints != null && Number.isInteger(task.awardedPoints)) {
    return clampPoints(task.awardedPoints, max);
  }
  if (task.kind === "match" && task.answerText && task.keyText) {
    return scoreMatchPairs(task.keyText, task.answerText).earned;
  }
  if (task.kind === "match") return task.correct ? max : 0;
  if (task.kind === "open") return task.correct ? 2 : 0;
  return task.correct ? 1 : 0;
}

export function nmtMathScaleScore(
  testPoints: number,
  maxTestPoints: number,
): number | null {
  if (maxTestPoints !== NMT_SCALE_PAPER_MAX) return null;
  if (!Number.isInteger(testPoints)) return null;
  return NMT_MATH_SCALE_2026[testPoints] ?? null;
}

export function scoreNmtPaper(tasks: readonly NmtScoreTask[]): NmtPaperScore {
  let testPoints = 0;
  let maxTestPoints = 0;
  for (const task of tasks) {
    testPoints += pointsForNmtTask(task);
    maxTestPoints += maxPointsForTask(task);
  }
  return {
    testPoints,
    maxTestPoints,
    scaleScore: nmtMathScaleScore(testPoints, maxTestPoints),
    passed: testPoints >= NMT_PASS_TEST_POINTS,
  };
}
