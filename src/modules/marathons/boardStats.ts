import { rankParticipants } from "./daily/leaderboard";

export type MarathonBoardKind = "daily" | "sessions";

/** Combined daily board: every active and finished daily marathon. */
export const ALL_MARATHONS_SLUG = "all";

export type BoardChoice = {
  slug: string;
  kind: MarathonBoardKind;
  status: string;
};

export type DailyDayResult = {
  userId: number;
  dayId: number;
  /** Day score already stored as a percent. */
  score: number | null;
  correctCount: number;
  /** Unix milliseconds. Null means the day is not finished. */
  completedAt: number | null;
  /** Whole-day duration, only when the product stored one. */
  timeSec?: number | null;
  taskCount?: number;
  /** Set when days from more than one marathon share a board, so day ids do not collide. */
  marathonId?: number;
};

export type DailyBoardPerson = {
  userId: number;
  displayName: string;
  login: string;
  /** Unix milliseconds. */
  joinedAt: number;
  streak: number;
};

export type DailyBoardRow = {
  rank: number;
  userId: number;
  displayName: string;
  login: string;
  streak: number;
  daysDone: number;
  avgPercent: number | null;
  points: number;
  avgSecPerTask: number | null;
};

/**
 * `all` is every daily marathon together. Otherwise an explicit slug, then the
 * current active daily marathon (latest start, if several are active), then the
 * first remaining row. Callers pass that list from `sortBoardChoices`.
 * Drafts never reach this list. `all` is refused when there is no daily marathon.
 */
export function pickMarathonSlug(
  options: readonly BoardChoice[],
  requested: string | undefined,
): string | null {
  if (options.length === 0) return null;
  const asked = requested?.trim();
  const hasDaily = options.some((item) => item.kind === "daily");
  if (asked === ALL_MARATHONS_SLUG && hasDaily) return ALL_MARATHONS_SLUG;
  if (asked && asked !== ALL_MARATHONS_SLUG && options.some((item) => item.slug === asked)) {
    return asked;
  }
  const activeDaily = options.find((item) => item.kind === "daily" && item.status === "active");
  return (activeDaily ?? options[0]).slug;
}

export function sortBoardChoices<T extends BoardChoice & { startsAt: number; id: number }>(
  options: readonly T[],
): T[] {
  const weight = (item: BoardChoice) => {
    if (item.kind === "daily" && item.status === "active") return 0;
    if (item.kind === "daily") return 1;
    return 2;
  };
  return [...options].sort((a, b) => {
    const byKind = weight(a) - weight(b);
    if (byKind !== 0) return byKind;
    if (a.startsAt !== b.startsAt) return b.startsAt - a.startsAt;
    return b.id - a.id;
  });
}

/**
 * Same order as Telegram `/top`: more correct answers first, then whoever
 * finished their latest day earlier. Days that are not submitted do not count.
 */
export function buildDailyBoard(
  people: readonly DailyBoardPerson[],
  days: readonly DailyDayResult[],
): DailyBoardRow[] {
  const roster = earliestDailyPeople(people);
  const byUser = new Map<number, DailyDayResult[]>();
  const seen = new Set<string>();
  for (const day of days) {
    if (!Number.isInteger(day.dayId) || day.dayId <= 0 || day.completedAt == null) continue;
    const scope = day.marathonId ?? "one";
    const key = `${day.userId}:${scope}:${day.dayId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = byUser.get(day.userId) ?? [];
    list.push(day);
    byUser.set(day.userId, list);
  }

  const ranked = rankParticipants(
    roster.map((person) => {
      const completed = byUser.get(person.userId) ?? [];
      const lastCompletedAt = completed.reduce<number | null>((latest, day) => {
        if (day.completedAt == null) return latest;
        return latest == null || day.completedAt > latest ? day.completedAt : latest;
      }, null);
      return {
        userId: person.userId,
        displayName: person.displayName,
        points: completed.reduce((sum, day) => sum + Math.max(0, day.correctCount || 0), 0),
        lastCompletedAt,
        streak: person.streak,
        joinedAt: person.joinedAt,
      };
    }),
  );

  return ranked.map((row) => {
    const completed = byUser.get(row.userId) ?? [];
    const scores = completed
      .map((day) => day.score)
      .filter((score): score is number => score != null && Number.isFinite(score));
    let timeSec = 0;
    let tasks = 0;
    for (const day of completed) {
      const duration = day.timeSec ?? null;
      const taskCount = day.taskCount ?? 0;
      if (duration != null && duration > 0 && taskCount > 0) {
        timeSec += duration;
        tasks += taskCount;
      }
    }
    return {
      rank: row.place,
      userId: row.userId,
      displayName: row.displayName,
      login: roster.find((person) => person.userId === row.userId)?.login ?? "",
      streak: row.streak,
      daysDone: completed.length,
      avgPercent: scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
      points: row.points,
      avgSecPerTask: tasks > 0 ? timeSec / tasks : null,
    };
  });
}

/** One row per person. The earliest join is the tie-break `/top` already uses. */
export function earliestDailyPeople(people: readonly DailyBoardPerson[]): DailyBoardPerson[] {
  const byUser = new Map<number, DailyBoardPerson>();
  for (const person of people) {
    const prev = byUser.get(person.userId);
    if (!prev || person.joinedAt < prev.joinedAt) byUser.set(person.userId, person);
  }
  return [...byUser.values()];
}

/** Daily rows hide speed until at least one day stored a duration. Session boards always show it. */
export function boardShowsSpeed(
  kind: MarathonBoardKind,
  rows: readonly { avgSecPerTask: number | null }[],
): boolean {
  if (kind === "sessions") return true;
  return rows.some((row) => row.avgSecPerTask != null);
}
