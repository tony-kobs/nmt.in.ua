/**
 * Structured "what went well / what needs attention" breakdown for a
 * Practice-mode result screen (`TopicTrainerSummary`, standard topic tests
 * only — see `isPracticeMode` in `@/modules/testing/sessionMode`). Pure and
 * deterministic: every field is derived from this session's persisted
 * `tasks2session` mistakes and the student's overall per-theme stats, never
 * invented. `RecommendedActionsPanel` already covers "recommended next
 * action" (`recommendFromSessionMistakes` / `recommendNextActionsForStats`)
 * — this module only adds the went-well/needs-attention framing on top, kept
 * out of the React component per the "recommendation calculation stays in
 * the domain layer" rule.
 */

import { groupMistakesByTheme } from "./recommendFromSessionMistakes";
import type { StudentTopicStats } from "./types";
import type { SessionMistakeItem } from "@/modules/testing/getSessionMistakeReview";
import type { TrainerSessionSummary } from "@/modules/testing/types";

/** Duplicated from `recommendNextActions`'s private `SOLID_THRESHOLD` — same
 * verified cutoff, kept local so this module has no import-order dependency
 * on `./index` (which imports `recommendFromSessionMistakes`, which this
 * file also imports). */
const SOLID_PERCENT_THRESHOLD = 70;

const MAX_STRONG_THEMES = 2;
const MAX_WEAK_THEMES = 2;
/** "Repeated mistakes" = 2+ wrong answers on the same theme in this one
 * session (a follow-up "similar task" missed again counts here). */
const REPEATED_MISTAKE_THRESHOLD = 2;

export type PracticeThemePerformance = {
  themeId: number;
  themeName: string;
  /** Overall percent across all of this student's completed sessions for
   * the theme — not just this one attempt. */
  percent: number;
};

export type PracticeThemeMistakes = {
  themeId: number;
  themeCode: string | null;
  themeName: string;
  /** Incorrect answers on this theme within THIS session, including any
   * dynamically appended "similar task" follow-ups. */
  mistakeCount: number;
};

export type PracticeResultInsight = {
  correctCount: number;
  totalCount: number;
  percent: number;
  /** Themes the student is already solid in overall — only populated when
   * stats actually support the claim (never fabricated for a first-ever or
   * all-wrong attempt). Excludes any theme that had a mistake this session. */
  strongThemes: PracticeThemePerformance[];
  /** This session's mistakes grouped by theme, most mistakes first — only
   * themes actually missed this session, capped for readability. */
  weakThemes: PracticeThemeMistakes[];
  /** True when some theme had 2+ mistakes in this one session — a stronger
   * signal than a single miss, used to prioritize "repeat this topic" copy. */
  hasRepeatedMistakes: boolean;
};

export function buildPracticeResultInsight(input: {
  summary: TrainerSessionSummary;
  mistakes: SessionMistakeItem[];
  topicStats: StudentTopicStats;
}): PracticeResultInsight {
  const { summary, mistakes, topicStats } = input;

  const weakThemesRanked = groupMistakesByTheme(mistakes);
  const weakThemeIds = new Set(weakThemesRanked.map((theme) => theme.themeId));

  const strongThemes: PracticeThemePerformance[] = topicStats.topicScores
    .filter(
      (topic) =>
        topic.overallPercent !== null &&
        topic.overallPercent >= SOLID_PERCENT_THRESHOLD &&
        !weakThemeIds.has(topic.themeId),
    )
    .sort((a, b) => (b.overallPercent as number) - (a.overallPercent as number))
    .slice(0, MAX_STRONG_THEMES)
    .map((topic) => ({
      themeId: topic.themeId,
      themeName: topic.themeName,
      percent: Math.round(topic.overallPercent as number),
    }));

  return {
    correctCount: summary.rightNumber,
    totalCount: summary.tasksNumber,
    percent: summary.percent,
    strongThemes,
    weakThemes: weakThemesRanked.slice(0, MAX_WEAK_THEMES),
    hasRepeatedMistakes: weakThemesRanked.some(
      (theme) => theme.mistakeCount >= REPEATED_MISTAKE_THRESHOLD,
    ),
  };
}
