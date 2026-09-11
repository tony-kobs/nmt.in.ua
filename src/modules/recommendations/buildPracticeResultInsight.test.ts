import assert from "node:assert/strict";
import test from "node:test";
import { buildPracticeResultInsight } from "./buildPracticeResultInsight";
import type { StudentTopicStats } from "./types";
import type { SessionMistakeItem } from "@/modules/testing/getSessionMistakeReview";
import type { TrainerSessionSummary } from "@/modules/testing/types";

function summary(overrides: Partial<TrainerSessionSummary> = {}): TrainerSessionSummary {
  return {
    sessionId: 5,
    rightNumber: 3,
    tasksNumber: 4,
    percent: 75,
    timeSec: 120,
    themeId: 7,
    themeCode: "ALG-01-TEST",
    themeName: "Рівняння",
    ...overrides,
  };
}

function mistake(
  partial: Partial<SessionMistakeItem> & Pick<SessionMistakeItem, "name">,
): SessionMistakeItem {
  return {
    taskText: "x",
    comment: "",
    themeId: null,
    themeCode: null,
    themeName: null,
    ...partial,
  };
}

function stats(overrides: Partial<StudentTopicStats> = {}): StudentTopicStats {
  return {
    topicScores: [],
    hasCompletedSessions: true,
    ...overrides,
  };
}

test("reports repeated mistakes in the session's own weak theme", () => {
  const insight = buildPracticeResultInsight({
    summary: summary(),
    mistakes: [
      mistake({ name: "a", themeId: 7, themeCode: "ALG-01-TEST", themeName: "Рівняння" }),
      mistake({ name: "b", themeId: 7, themeCode: "ALG-01-TEST", themeName: "Рівняння" }),
    ],
    topicStats: stats(),
  });

  assert.equal(insight.correctCount, 3);
  assert.equal(insight.totalCount, 4);
  assert.equal(insight.percent, 75);
  assert.deepEqual(insight.weakThemes, [
    { themeId: 7, themeCode: "ALG-01-TEST", themeName: "Рівняння", mistakeCount: 2 },
  ]);
  assert.equal(insight.hasRepeatedMistakes, true);
});

test("a single miss is not flagged as a repeated mistake", () => {
  const insight = buildPracticeResultInsight({
    summary: summary(),
    mistakes: [
      mistake({ name: "a", themeId: 7, themeCode: "ALG-01-TEST", themeName: "Рівняння" }),
    ],
    topicStats: stats(),
  });

  assert.equal(insight.hasRepeatedMistakes, false);
  assert.equal(insight.weakThemes[0]?.mistakeCount, 1);
});

test("strong themes only include overall-solid themes not missed this session", () => {
  const insight = buildPracticeResultInsight({
    summary: summary(),
    mistakes: [
      mistake({ name: "a", themeId: 7, themeCode: "ALG-01-TEST", themeName: "Рівняння" }),
    ],
    topicStats: stats({
      topicScores: [
        { themeId: 7, themeName: "Рівняння", overallPercent: 40, lastPercent: 40 },
        { themeId: 3, themeName: "Геометрія", overallPercent: 90, lastPercent: 90 },
        { themeId: 4, themeName: "Функції", overallPercent: 55, lastPercent: 55 },
      ],
    }),
  });

  assert.deepEqual(insight.strongThemes, [
    { themeId: 3, themeName: "Геометрія", percent: 90 },
  ]);
});

test("strong themes are capped and ranked by percent", () => {
  const insight = buildPracticeResultInsight({
    summary: summary(),
    mistakes: [],
    topicStats: stats({
      topicScores: [
        { themeId: 1, themeName: "A", overallPercent: 72, lastPercent: 72 },
        { themeId: 2, themeName: "B", overallPercent: 95, lastPercent: 95 },
        { themeId: 3, themeName: "C", overallPercent: 88, lastPercent: 88 },
      ],
    }),
  });

  assert.deepEqual(insight.strongThemes, [
    { themeId: 2, themeName: "B", percent: 95 },
    { themeId: 3, themeName: "C", percent: 88 },
  ]);
});

test("gracefully returns empty sections for a first attempt with little data", () => {
  const insight = buildPracticeResultInsight({
    summary: summary({ rightNumber: 4, tasksNumber: 4, percent: 100 }),
    mistakes: [],
    topicStats: stats({ topicScores: [], hasCompletedSessions: true }),
  });

  assert.deepEqual(insight.strongThemes, []);
  assert.deepEqual(insight.weakThemes, []);
  assert.equal(insight.hasRepeatedMistakes, false);
  assert.equal(insight.correctCount, 4);
  assert.equal(insight.totalCount, 4);
});

test("never invents a strong theme from a null (untried) overall percent", () => {
  const insight = buildPracticeResultInsight({
    summary: summary(),
    mistakes: [],
    topicStats: stats({
      topicScores: [
        { themeId: 9, themeName: "Untried", overallPercent: null, lastPercent: null },
      ],
    }),
  });

  assert.deepEqual(insight.strongThemes, []);
});
