/**
 * Модуль 4 — рекомендаційна система.
 *
 * Вхід: результати тестування учня (`StudentTopicStats`, з `getStudentTopicStats`).
 * Вихід: наступні дії (тема, тренажер, матеріали, консультація).
 */

import type { ThemeConnectionEdge } from "./getThemeConnections";
import { getThemeConnectionsForThemes } from "./getThemeConnections";
import type { StudentTopicScore, StudentTopicStats } from "./types";

export type { StudentTopicScore, StudentTopicStats } from "./types";
export type { ThemeConnectionEdge } from "./getThemeConnections";
export { getThemeConnectionsForThemes } from "./getThemeConnections";

export type RecommendedAction = {
  type: "topic-test" | "simulator" | "materials" | "problems" | "consultation";
  title: string;
  reason: string;
  href: string;
  priority: number;
  /** Present for `topic-test` actions — used when persisting planned auto sessions. */
  themeId?: number;
};

export { persistRecommendations } from "./persistRecommendations";
export type { PersistRecommendationsResult } from "./persistRecommendations";
export { recommendFromSessionMistakes } from "./recommendFromSessionMistakes";

const WEAK_THRESHOLD = 40;
const SOLID_THRESHOLD = 70;
const MAX_WEAK_ACTIONS = 2;
const MAX_UNTRIED_ACTIONS = 2;
const MAX_GRAPH_ACTIONS = 2;
const MAX_RECOMMENDATIONS = 3;

export type RecommendationTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

function topicTestThemeIds(actions: RecommendedAction[]): Set<number> {
  const ids = new Set<number>();
  for (const action of actions) {
    if (action.type === "topic-test" && typeof action.themeId === "number") {
      ids.add(action.themeId);
    }
  }
  return ids;
}

function isTopicWeakOrUntried(topic: StudentTopicScore): boolean {
  if (topic.overallPercent === null) return true;
  return topic.overallPercent < WEAK_THRESHOLD;
}

function appendGraphRecommendations(
  stats: StudentTopicStats,
  graphEdges: ThemeConnectionEdge[],
  actions: RecommendedAction[],
  priorityStart: number,
  t: RecommendationTranslator,
): number {
  if (graphEdges.length === 0) {
    return priorityStart;
  }

  const topicById = new Map(
    stats.topicScores.map((topic) => [topic.themeId, topic]),
  );
  const solidThemeIds = new Set(
    stats.topicScores
      .filter(
        (topic) =>
          topic.overallPercent !== null &&
          topic.overallPercent >= SOLID_THRESHOLD,
      )
      .map((topic) => topic.themeId),
  );
  const usedThemeIds = topicTestThemeIds(actions);
  let priority = priorityStart;
  let graphAdded = 0;

  for (const edge of graphEdges) {
    if (graphAdded >= MAX_GRAPH_ACTIONS) break;
    if (!solidThemeIds.has(edge.fromThemeId)) continue;
    if (usedThemeIds.has(edge.toThemeId)) continue;

    const target = topicById.get(edge.toThemeId);
    if (!target || !isTopicWeakOrUntried(target)) continue;

    const source = topicById.get(edge.fromThemeId);
    actions.push({
      type: "topic-test",
      themeId: target.themeId,
      title: t("goToTopic", { theme: target.themeName }),
      reason: source
        ? t("graphReason", { theme: source.themeName })
        : t("graphReasonFallback"),
      href: `/?theme=${target.themeId}`,
      priority: priority++,
    });
    usedThemeIds.add(target.themeId);
    graphAdded += 1;
  }

  return priority;
}

/** Побудувати список наступних дій для учня на основі поточної статистики по темах. */
export function recommendNextActions(
  stats: StudentTopicStats,
  graphEdges: ThemeConnectionEdge[] = [],
  t: RecommendationTranslator,
): RecommendedAction[] {
  if (!stats.hasCompletedSessions) {
    return [];
  }

  const attempted = stats.topicScores.filter(
    (topic) => topic.overallPercent !== null,
  );
  const untried = stats.topicScores.filter(
    (topic) => topic.overallPercent === null,
  );
  const weak = attempted
    .filter((topic) => (topic.overallPercent as number) < WEAK_THRESHOLD)
    .sort(
      (a, b) => (a.overallPercent as number) - (b.overallPercent as number),
    );

  const actions: RecommendedAction[] = [];
  let priority = 1;

  for (const topic of weak.slice(0, MAX_WEAK_ACTIONS)) {
    actions.push({
      type: "topic-test",
      themeId: topic.themeId,
      title: t("repeatTopic", { theme: topic.themeName }),
      reason: t("weakTopicReason", {
        percent: Math.round(topic.overallPercent as number),
      }),
      href: `/?theme=${topic.themeId}`,
      priority: priority++,
    });
  }

  priority = appendGraphRecommendations(
    stats,
    graphEdges,
    actions,
    priority,
    t,
  );

  const usedThemeIds = topicTestThemeIds(actions);
  for (const topic of untried.slice(0, MAX_UNTRIED_ACTIONS)) {
    if (usedThemeIds.has(topic.themeId)) continue;
    actions.push({
      type: "topic-test",
      themeId: topic.themeId,
      title: t("tryTopic", { theme: topic.themeName }),
      reason: t("untriedReason"),
      href: `/?theme=${topic.themeId}`,
      priority: priority++,
    });
    usedThemeIds.add(topic.themeId);
  }

  if (weak.length >= 2) {
    actions.push({
      type: "consultation",
      title: t("consultationTitle"),
      reason: t("consultationReason"),
      href: "/consultations",
      priority: priority++,
    });
  }

  if (weak.length > 0) {
    actions.push({
      type: "materials",
      title: t("materialsTitle"),
      reason: t("materialsReason"),
      href: "/materials/textbook",
      priority: priority++,
    });
  }

  const solidCount = attempted.filter(
    (topic) => (topic.overallPercent as number) >= SOLID_THRESHOLD,
  ).length;
  if (untried.length === 0 && weak.length === 0 && solidCount > 0) {
    actions.push({
      type: "simulator",
      title: t("simulatorTitle"),
      reason: t("simulatorReason"),
      href: "/simulator",
      priority: priority++,
    });
  }

  if (actions.length === 0) {
    actions.push({
      type: "problems",
      title: t("problemsTitle"),
      reason: t("problemsReason"),
      href: "/problems",
      priority: priority++,
    });
  }

  return actions
    .sort((a, b) => a.priority - b.priority)
    .slice(0, MAX_RECOMMENDATIONS);
}

type RecommendNextActionsForStatsDeps = {
  getThemeConnectionsForThemes: typeof getThemeConnectionsForThemes;
};

/** Loads the theme graph for solid topics and builds recommendations. */
export async function recommendNextActionsForStats(
  stats: StudentTopicStats,
  t: RecommendationTranslator,
  deps: RecommendNextActionsForStatsDeps = {
    getThemeConnectionsForThemes,
  },
): Promise<RecommendedAction[]> {
  const solidThemeIds = stats.topicScores
    .filter(
      (topic) =>
        topic.overallPercent !== null &&
        topic.overallPercent >= SOLID_THRESHOLD,
    )
    .map((topic) => topic.themeId);

  const graphEdges =
    solidThemeIds.length > 0
      ? await deps.getThemeConnectionsForThemes(solidThemeIds)
      : [];

  return recommendNextActions(stats, graphEdges, t);
}
