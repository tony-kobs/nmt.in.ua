export type DayReadiness = {
  dayNumber: number;
  taskCount: number;
};

export type ActivationBlockers = {
  daysCount: number;
  missingDays: number[];
  emptyDays: number[];
};

/** Days 1..daysCount must each exist and contain at least one task. */
export function activationBlockers(input: {
  daysCount: number;
  days: DayReadiness[];
}): ActivationBlockers {
  const tasks = new Map<number, number>();
  for (const day of input.days) {
    if (!Number.isInteger(day.dayNumber) || day.dayNumber < 1 || day.dayNumber > input.daysCount) {
      continue;
    }
    tasks.set(day.dayNumber, (tasks.get(day.dayNumber) ?? 0) + Math.max(0, day.taskCount));
  }
  const missingDays: number[] = [];
  const emptyDays: number[] = [];
  const daysCount = Number.isInteger(input.daysCount) && input.daysCount > 0 ? input.daysCount : 0;
  for (let dayNumber = 1; dayNumber <= daysCount; dayNumber += 1) {
    if (!tasks.has(dayNumber)) missingDays.push(dayNumber);
    else if ((tasks.get(dayNumber) ?? 0) < 1) emptyDays.push(dayNumber);
  }
  return { daysCount, missingDays, emptyDays };
}

export function marathonIsReady(blockers: ActivationBlockers): boolean {
  return (
    blockers.daysCount >= 1
    && blockers.missingDays.length === 0
    && blockers.emptyDays.length === 0
  );
}
