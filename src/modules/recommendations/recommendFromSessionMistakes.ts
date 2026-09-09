/**
 * Session-scoped recommendations after an NMT simulator attempt:
 * themes with mistakes → textbook section + topic quiz_tasks practice.
 */

import type { RecommendedAction, RecommendationTranslator } from "./index";
import type { SessionMistakeItem } from "@/modules/testing/getSessionMistakeReview";

const MAX_THEMES = 3;

type ThemeBucket = {
  themeId: number;
  themeCode: string | null;
  themeName: string;
  mistakeCount: number;
};

/** Build materials + topic-test actions from incorrect NMT tasks. */
export function recommendFromSessionMistakes(
  mistakes: SessionMistakeItem[],
  t: RecommendationTranslator,
): RecommendedAction[] {
  const byTheme = new Map<number, ThemeBucket>();

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

  const ranked = [...byTheme.values()].sort(
    (a, b) => b.mistakeCount - a.mistakeCount || a.themeName.localeCompare(b.themeName),
  );

  const actions: RecommendedAction[] = [];
  let priority = 1;

  for (const theme of ranked.slice(0, MAX_THEMES)) {
    const materialsHref = theme.themeCode
      ? `/materials/textbook?topic=${encodeURIComponent(theme.themeCode)}`
      : "/materials/textbook";

    actions.push({
      type: "materials",
      themeId: theme.themeId,
      title: t("nmtMaterialsTitle", { theme: theme.themeName }),
      reason: t("nmtMistakeReason", { count: theme.mistakeCount }),
      href: materialsHref,
      priority: priority++,
    });

    actions.push({
      type: "topic-test",
      themeId: theme.themeId,
      title: t("repeatTopic", { theme: theme.themeName }),
      reason: t("nmtPracticeReason", { count: theme.mistakeCount }),
      href: `/?theme=${theme.themeId}`,
      priority: priority++,
    });
  }

  return actions;
}
