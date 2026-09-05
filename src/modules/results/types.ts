export type TopicResultRow = {
  themeId: number;
  themeCode: string;
  themeName: string;
  displayIndex: number;
  overallPercent: number | null;
  lastThreePercent: number | null;
  avgSecondsPerTask: number | null;
};

export type ScoreLevel = "high" | "medium" | "low" | "none";

export function getScoreLevel(percent: number | null): ScoreLevel {
  if (percent === null) return "none";
  if (percent >= 70) return "high";
  if (percent >= 40) return "medium";
  return "low";
}

export function formatPercent(percent: number | null): string {
  if (percent === null) return "—";
  return `${Math.round(percent)}%`;
}

export function formatSpeed(secondsPerTask: number | null): string {
  if (secondsPerTask === null) return "—";
  return secondsPerTask.toFixed(1).replace(".", ",");
}

function sessionPercent(tasksNumber: number, rightNumber: number): number | null {
  if (tasksNumber <= 0) return null;
  return (rightNumber / tasksNumber) * 100;
}

function sessionSpeed(tasksNumber: number, timeSec: number): number | null {
  if (tasksNumber <= 0 || timeSec <= 0) return null;
  return timeSec / tasksNumber;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export type SessionRow = {
  id: number;
  theme_id: number;
  tasks_number: number;
  right_number: number;
  time: number;
};

export type ThemeRow = {
  id: number;
  code?: string;
  name: string;
  ord: number;
};

/** Builds topic result rows from themes and the user's sessions. */
export function buildTopicResultRows(
  themes: ThemeRow[],
  sessions: SessionRow[],
): TopicResultRow[] {
  const sessionsByTheme = new Map<number, SessionRow[]>();
  for (const session of sessions) {
    const list = sessionsByTheme.get(session.theme_id) ?? [];
    list.push(session);
    sessionsByTheme.set(session.theme_id, list);
  }

  return themes.map((theme, index) => {
    const themeSessions = sessionsByTheme.get(theme.id) ?? [];
    const percents = themeSessions
      .map((session) =>
        sessionPercent(session.tasks_number, session.right_number),
      )
      .filter((value): value is number => value !== null);
    const lastThreePercents = themeSessions
      .slice(0, 3)
      .map((session) =>
        sessionPercent(session.tasks_number, session.right_number),
      )
      .filter((value): value is number => value !== null);
    const speeds = themeSessions
      .map((session) => sessionSpeed(session.tasks_number, session.time))
      .filter((value): value is number => value !== null);

    return {
      themeId: theme.id,
      themeCode: theme.code?.trim() || `T-${theme.id}`,
      themeName: theme.name.trim(),
      displayIndex: index + 1,
      overallPercent: average(percents),
      lastThreePercent: average(lastThreePercents),
      avgSecondsPerTask: average(speeds),
    };
  });
}
