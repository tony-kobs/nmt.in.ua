/**
 * Session-scoped recommendations from a just-finished attempt: themes with
 * mistakes → textbook section + topic quiz_tasks practice. Originally built
 * for the NMT simulator's post-finish review, but `finishTrainerSessionAction`
 * now calls this for every trainer mode (Practice/Ultimate too, falling back
 * to `recommendNextActionsForStats` only when this session had no mistakes)
 * — see `AGENTS.md` §6.3. Keep copy generic to "this session", not
 * simulator-specific.
 */

import type { RecommendedAction, RecommendationTranslator } from "./index";
import type { SessionMistakeItem } from "@/modules/testing/getSessionMistakeReview";

const MAX_THEMES = 3;

export type ThemeMistakeBucket = {
  themeId: number;
  themeCode: string | null;
  themeName: string;
  mistakeCount: number;
};

/** Groups this session's incorrect tasks by theme, ranked by mistake count
 * (most first, ties broken alphabetically) — shared by
 * `recommendFromSessionMistakes` and `buildPracticeResultInsight`. */
export function groupMistakesByTheme(
  mistakes: SessionMistakeItem[],
): ThemeMistakeBucket[] {
  const byTheme = new Map<number, ThemeMistakeBucket>();

  for (const item of mistakes) {
    if (item.themeId == null || !item.themeName) continue;
    const existing = byTheme.get(item.themeId);
    if (existing) {
      existing.mistakeCount += 1;
      continue;
    }
    byTheme.set(item.themeId, {
      themeId: item.themeId,
      themeCode: item.themeCode,
      themeName: item.themeName,
      mistakeCount: 1,
    });
  }

  return [...byTheme.values()].sort(
    (a, b) => b.mistakeCount - a.mistakeCount || a.themeName.localeCompare(b.themeName),
  );
}

/** Build materials + topic-test actions from this session's incorrect tasks. */
export function recommendFromSessionMistakes(
  mistakes: SessionMistakeItem[],
  t: RecommendationTranslator,
): RecommendedAction[] {
  const ranked = groupMistakesByTheme(mistakes);

  const actions: RecommendedAction[] = [];
  let priority = 1;

  for (const theme of ranked.slice(0, MAX_THEMES)) {
    const materialsHref = theme.themeCode
      ? `/materials/textbook?topic=${encodeURIComponent(theme.themeCode)}`
      : "/materials/textbook";

    actions.push({
      type: "materials",
      themeId: theme.themeId,
      title: t("sessionMistakeMaterialsTitle", { theme: theme.themeName }),
      reason: t("sessionMistakeReason", { count: theme.mistakeCount }),
      href: materialsHref,
      priority: priority++,
    });

    actions.push({
      type: "topic-test",
      themeId: theme.themeId,
      title: t("repeatTopic", { theme: theme.themeName }),
      reason: t("sessionMistakePracticeReason", { count: theme.mistakeCount }),
      href: `/?theme=${theme.themeId}`,
      priority: priority++,
    });
  }

  return actions;
}
