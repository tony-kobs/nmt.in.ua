export const SELF_SCORE_SOURCES = ["diagnostic_overall", "pre_topic"] as const;

export type SelfScoreSource = (typeof SELF_SCORE_SOURCES)[number];

export const SELF_SCORE_MIN = 1;
export const SELF_SCORE_MAX = 10;

export function isSelfScoreSource(value: unknown): value is SelfScoreSource {
  return value === "diagnostic_overall" || value === "pre_topic";
}

export function isValidSelfScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= SELF_SCORE_MIN &&
    value <= SELF_SCORE_MAX
  );
}

export type SelfScoreRow = {
  theme_id: number | null;
  score: number;
  source: SelfScoreSource;
};

export type LatestSelfScores = {
  /** Latest `pre_topic` score per theme_id. */
  byTheme: Map<number, number>;
  /** Latest `diagnostic_overall` score, if any. */
  overall: number | null;
};

/**
 * Reduces self-score history rows into the latest value per bucket. Rows
 * must already be ordered `created_at DESC, id DESC` (newest first) by the
 * caller's query, so the first row seen per bucket wins.
 */
export function reduceLatestSelfScores(rows: SelfScoreRow[]): LatestSelfScores {
  const byTheme = new Map<number, number>();
  let overall: number | null = null;

  for (const row of rows) {
    if (row.source === "pre_topic" && row.theme_id !== null) {
      if (!byTheme.has(row.theme_id)) {
        byTheme.set(row.theme_id, row.score);
      }
    } else if (row.source === "diagnostic_overall" && overall === null) {
      overall = row.score;
    }
  }

  return { byTheme, overall };
}

/** Latest `pre_topic` score for the theme, falling back to the latest
 * `diagnostic_overall` score, else `null`. */
export function resolveDisplaySelfScore(
  themeId: number,
  latest: LatestSelfScores,
): number | null {
  return latest.byTheme.get(themeId) ?? latest.overall ?? null;
}
