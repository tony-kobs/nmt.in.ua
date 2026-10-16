import { dayUnlockAt } from "./calendar";

/**
 * The last scheduled day closes when the next calendar day would unlock.
 * A course with no day rows still ends on this clock: `days_count` is the schedule.
 */
export function dailyMarathonClosesAt(input: {
  startDate: string;
  unlockHour: string;
  daysCount: number;
}): Date | null {
  if (!Number.isInteger(input.daysCount) || input.daysCount < 1) return null;
  try {
    return dayUnlockAt({
      startDate: input.startDate,
      unlockHour: input.unlockHour,
      dayNumber: input.daysCount + 1,
    });
  } catch {
    return null;
  }
}

export function shouldFinishDailyMarathon(
  now: Date,
  input: { startDate: string; unlockHour: string; daysCount: number },
): boolean {
  const closesAt = dailyMarathonClosesAt(input);
  return closesAt != null && now.getTime() >= closesAt.getTime();
}
