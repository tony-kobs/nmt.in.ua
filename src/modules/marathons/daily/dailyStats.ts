export type DayFunnel = {
  day: number;
  opened: number;
  completed: number;
  avgScore: number | null;
  dropoff: number;
};

export type DailyFunnel = {
  slug: string;
  registered: number;
  telegramLinked: number;
  finished: number;
  days: DayFunnel[];
  ticketsOpen: number;
  deliveryErrors24h: number;
};

export type DayFunnelInput = {
  day: number;
  opened: number;
  completed: number;
  scoreSum: number;
  scoreCount: number;
};

function whole(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/**
 * Day 1 dropoff is registered minus completed.
 * Later days drop off from the previous day's completed count.
 * A rise never counts as a negative dropoff.
 */
export function buildDailyFunnel(input: {
  slug: string;
  daysCount: number;
  registered: number;
  telegramLinked: number;
  finished: number;
  days: readonly DayFunnelInput[];
  ticketsOpen: number;
  deliveryErrors24h: number;
}): DailyFunnel {
  const total = Math.max(0, Math.min(99, Math.floor(input.daysCount) || 0));
  const byDay = new Map<number, DayFunnelInput>();
  for (const day of input.days) {
    if (day.day >= 1 && day.day <= total) byDay.set(day.day, day);
  }
  const registered = whole(input.registered);
  const days: DayFunnel[] = [];
  let previousCompleted = registered;
  for (let day = 1; day <= total; day += 1) {
    const row = byDay.get(day);
    const opened = whole(row?.opened ?? 0);
    const completed = whole(row?.completed ?? 0);
    const scoreCount = whole(row?.scoreCount ?? 0);
    const scoreSum = Number.isFinite(row?.scoreSum) ? Number(row?.scoreSum) : 0;
    days.push({
      day,
      opened,
      completed,
      avgScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null,
      dropoff: Math.max(0, previousCompleted - completed),
    });
    previousCompleted = completed;
  }
  return {
    slug: input.slug,
    registered,
    telegramLinked: whole(input.telegramLinked),
    finished: whole(input.finished),
    days,
    ticketsOpen: whole(input.ticketsOpen),
    deliveryErrors24h: whole(input.deliveryErrors24h),
  };
}
