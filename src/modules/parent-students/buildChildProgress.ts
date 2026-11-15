import { sessionPercent } from "@/modules/sessions/types";
import { sessionThemeLabel } from "@/modules/themes/sessionThemeLabel";
import type { ParentChild } from "./types";

type SqlNumber = number | string;
export type ProgressTotalsRow = {
  child_id: number; display_name: string;
  completed_sessions: SqlNumber; total_tasks: SqlNumber | null; correct_answers: SqlNumber | null;
};
export type ProgressTopicRow = Omit<ProgressTotalsRow, "display_name"> & {
  theme_id: number | null; theme_code: string | null; theme_name: string | null;
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
export type ChildTopicProgress = ChildProgressSummary & { themeId: number; themeCode: string; themeName: string };
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

/** Weighted answer percentages, never curriculum completion or the NMT points scale. */
export function buildChildProgress(
  summary: ProgressTotalsRow, topics: ProgressTopicRow[], recent: ProgressRecentRow[],
): ChildProgress {
  return {
    child: { id: summary.child_id, displayName: summary.display_name },
    summary: totals(summary),
    topics: topics.flatMap((row) => row.theme_id === null ? [] : [{ ...totals(row),
      themeId: row.theme_id, themeCode: row.theme_code?.trim() || `T-${row.theme_id}`,
      themeName: sessionThemeLabel({ themeId: row.theme_id, themeName: row.theme_name }),
    }]),
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
