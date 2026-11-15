import {
  buildTopicResultRows,
  type SessionRow,
  type ThemeRow,
  type TopicResultRow,
} from "@/modules/results/types";
import { sessionPercent } from "@/modules/sessions/types";
import { sessionThemeLabel } from "@/modules/themes/sessionThemeLabel";
import type { ParentChild } from "./types";

type SqlNumber = number | string;
export type ProgressTotalsRow = {
  child_id: number; display_name: string;
  completed_sessions: SqlNumber; total_tasks: SqlNumber | null; correct_answers: SqlNumber | null;
};
export type ProgressThemeRow = {
  child_id: number;
  theme_id: number | null;
  theme_code: string | null;
  theme_name: string | null;
  theme_ord: number | null;
};
export type ProgressSessionMetricRow = {
  child_id: number;
  session_id: number | null;
  theme_id: number | null;
  tasks_number: number | null;
  right_number: number | null;
  time: number | null;
};
export type ProgressAttemptRow = {
  child_id: number;
  theme_id: number | null;
  attempts: SqlNumber | null;
};
export type ProgressRecentRow = {
  child_id: number; session_id: number | null; session_type: number | null;
  theme_id: number | null; theme_name: string | null; start_time: number | null;
  tasks_number: number | null; right_number: number | null;
  test_points: number | null; test_points_max: number | null;
};
export type ChildProgressSummary = {
  completedSessions: number; totalTasks: number; correctAnswers: number; correctPercent: number | null;
};
/** Same shape the student results table renders, including the textbook code. */
export type ChildTopicProgress = TopicResultRow;
export type ChildRecentResult = {
  sessionId: number; sessionType: number | null; themeId: number | null; themeName: string;
  startedAt: number | null; totalTasks: number; correctAnswers: number; correctPercent: number | null;
  testPoints: number | null; maxTestPoints: number | null;
};
export type ChildProgress = {
  child: ParentChild; summary: ChildProgressSummary; topics: ChildTopicProgress[]; recentResults: ChildRecentResult[];
};

function totals(row: Pick<ProgressTotalsRow, "completed_sessions" | "total_tasks" | "correct_answers">): ChildProgressSummary {
  const totalTasks = Number(row.total_tasks ?? 0);
  const correctAnswers = Number(row.correct_answers ?? 0);
  return { completedSessions: Number(row.completed_sessions), totalTasks, correctAnswers,
    correctPercent: sessionPercent(totalTasks, correctAnswers) };
}

function themeRows(rows: ProgressThemeRow[]): ThemeRow[] {
  return rows.flatMap((row) => row.theme_id === null ? [] : [{
    id: row.theme_id,
    code: row.theme_code ?? undefined,
    name: row.theme_name?.trim() ?? "",
    ord: Number(row.theme_ord ?? 0),
  }]);
}

function sessionRows(rows: ProgressSessionMetricRow[]): SessionRow[] {
  return rows.flatMap((row) => {
    if (row.session_id === null || row.theme_id === null) return [];
    return [{
      id: row.session_id,
      theme_id: row.theme_id,
      tasks_number: Number(row.tasks_number ?? 0),
      right_number: Number(row.right_number ?? 0),
      time: Number(row.time ?? 0),
    }];
  });
}

function attemptCounts(rows: ProgressAttemptRow[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const row of rows) {
    if (row.theme_id === null) continue;
    counts.set(row.theme_id, Number(row.attempts) || 0);
  }
  return counts;
}

/**
 * Topic rows match the student cabinet: display order, last-three average,
 * seconds per task, full attempt count, and theme code for the textbook link.
 * The summary stays a weighted total of completed answers.
 */
export function buildChildProgress(
  summary: ProgressTotalsRow,
  themes: ProgressThemeRow[],
  sessions: ProgressSessionMetricRow[],
  attempts: ProgressAttemptRow[],
  recent: ProgressRecentRow[],
): ChildProgress {
  const counts = attemptCounts(attempts);
  const topics = buildTopicResultRows(themeRows(themes), sessionRows(sessions)).map((row) => ({
    ...row,
    attemptsCount: counts.get(row.themeId) ?? row.attemptsCount,
  }));
  return {
    child: { id: summary.child_id, displayName: summary.display_name },
    summary: totals(summary),
    topics,
    recentResults: recent.flatMap((row) => row.session_id === null ? [] : [{
      sessionId: row.session_id, sessionType: row.session_type, themeId: row.theme_id,
      themeName: sessionThemeLabel({ themeId: row.theme_id, themeName: row.theme_name, sessionType: row.session_type }),
      startedAt: row.start_time && row.start_time > 0 ? row.start_time : null,
      totalTasks: Number(row.tasks_number ?? 0), correctAnswers: Number(row.right_number ?? 0),
      correctPercent: sessionPercent(Number(row.tasks_number ?? 0), Number(row.right_number ?? 0)),
      testPoints: row.session_type === 4 ? row.test_points : null,
      maxTestPoints: row.session_type === 4 ? row.test_points_max : null,
    }]),
  };
}
