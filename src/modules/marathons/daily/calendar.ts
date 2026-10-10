export const KYIV_TIME_ZONE = "Europe/Kyiv";

/** Evening reminder is fixed in the product: 19:00 Europe/Kyiv. */
export const REMINDER_HOUR = 19;

/**
 * Day-open mail is sent at unlock and retried if cron was late, but not as a
 * backlog for people who join days later.
 */
export const DAY_OPEN_NOTIFY_WINDOW_MS = 36 * 60 * 60 * 1000;

type DateParts = { year: number; month: number; day: number };

function readPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}

/** Offset of `timeZone` at `utcMs`: wall clock expressed as UTC minus the real UTC. */
export function zoneOffsetMs(
  utcMs: number,
  timeZone = KYIV_TIME_ZONE,
): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  let year = Number(readPart(parts, "year"));
  let month = Number(readPart(parts, "month"));
  let day = Number(readPart(parts, "day"));
  let hour = Number(readPart(parts, "hour"));
  if (hour === 24) {
    hour = 0;
    const next = new Date(Date.UTC(year, month - 1, day) + 86_400_000);
    year = next.getUTCFullYear();
    month = next.getUTCMonth() + 1;
    day = next.getUTCDate();
  }
  const asUtc = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    Number(readPart(parts, "minute")),
    Number(readPart(parts, "second")),
  );
  return asUtc - utcMs;
}

/** Wall-clock time in `timeZone` → UTC instant. Calendar addition is the caller's job. */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone = KYIV_TIME_ZONE,
): Date {
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utc = desired;
  for (let i = 0; i < 4; i += 1) {
    utc = desired - zoneOffsetMs(utc, timeZone);
  }
  return new Date(utc);
}

export function addCalendarDays(isoDate: string, days: number): DateParts {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    throw new Error("bad date");
  }
  const [year, month, day] = isoDate.split("-").map(Number);
  const shifted = new Date(Date.UTC(year!, (month ?? 1) - 1, (day ?? 1) + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function parseUnlockHour(
  value: string,
): { hour: number; minute: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export type UnlockInput = {
  startDate: string;
  unlockHour: string;
  dayNumber: number;
};

/** Day N opens at start_date + (N-1) calendar days, at unlock_hour in Europe/Kyiv. */
export function dayUnlockAt(input: UnlockInput): Date {
  const clock = parseUnlockHour(input.unlockHour);
  if (!clock || !Number.isInteger(input.dayNumber) || input.dayNumber < 1) {
    throw new Error("bad unlock");
  }
  const date = addCalendarDays(input.startDate, input.dayNumber - 1);
  return zonedWallTimeToUtc(
    date.year,
    date.month,
    date.day,
    clock.hour,
    clock.minute,
  );
}

export function isDayUnlocked(now: Date, input: UnlockInput): boolean {
  return now.getTime() >= dayUnlockAt(input).getTime();
}

export function kyivHour(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KYIV_TIME_ZONE,
    hourCycle: "h23",
    hour: "2-digit",
  }).formatToParts(instant);
  let hour = Number(readPart(parts, "hour"));
  if (hour === 24) hour = 0;
  return hour;
}

export function kyivDateIso(instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KYIV_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const year = readPart(parts, "year");
  const month = readPart(parts, "month");
  const day = readPart(parts, "day");
  return `${year}-${month}-${day}`;
}

export function formatKyivWhen(instant: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: KYIV_TIME_ZONE,
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(instant);
}

export type DayAccess =
  | { open: true; unlockAt: Date }
  | { open: false; code: "invalid_day" | "locked"; unlockAt: Date | null };

/**
 * Server clock only. Callers pass `now` from the server — never from the client.
 */
export function evaluateDayAccess(input: {
  now: Date;
  startDate: string;
  unlockHour: string;
  daysCount: number;
  dayNumber: number;
}): DayAccess {
  if (
    !Number.isInteger(input.dayNumber) ||
    input.dayNumber < 1 ||
    input.dayNumber > input.daysCount
  ) {
    return { open: false, code: "invalid_day", unlockAt: null };
  }
  let unlockAt: Date;
  try {
    unlockAt = dayUnlockAt(input);
  } catch {
    return { open: false, code: "invalid_day", unlockAt: null };
  }
  if (input.now.getTime() < unlockAt.getTime()) {
    return { open: false, code: "locked", unlockAt };
  }
  return { open: true, unlockAt };
}

export function listDayAccess(input: {
  now: Date;
  startDate: string;
  unlockHour: string;
  daysCount: number;
}): Array<{ dayNumber: number; open: boolean; unlockAt: Date | null }> {
  const days = [];
  for (let dayNumber = 1; dayNumber <= input.daysCount; dayNumber += 1) {
    const access = evaluateDayAccess({ ...input, dayNumber });
    days.push({
      dayNumber,
      open: access.open,
      unlockAt: access.unlockAt,
    });
  }
  return days;
}

/** Calendar day of day N, 19:00 Europe/Kyiv. */
export function reminderAt(input: {
  startDate: string;
  dayNumber: number;
}): Date {
  const date = addCalendarDays(input.startDate, input.dayNumber - 1);
  return zonedWallTimeToUtc(date.year, date.month, date.day, REMINDER_HOUR, 0);
}
