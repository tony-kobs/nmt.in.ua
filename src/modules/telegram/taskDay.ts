export const TELEGRAM_TASK_TIME_ZONE = "Europe/Kyiv";

const calendar = new Intl.DateTimeFormat("en-US", {
  timeZone: TELEGRAM_TASK_TIME_ZONE,
  year: "numeric", month: "2-digit", day: "2-digit",
});
const offset = new Intl.DateTimeFormat("en-US", {
  timeZone: TELEGRAM_TASK_TIME_ZONE, timeZoneName: "shortOffset",
});

function midnightUnixSec(utcCalendarMidnight: number): number {
  let instant = utcCalendarMidnight;
  for (let i = 0; i < 3; i++) {
    const label = offset.formatToParts(instant).find((part) => part.type === "timeZoneName")!.value;
    const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(label);
    if (!match) throw new Error("Unsupported task timezone offset.");
    const offsetMs = (Number(match[2]) * 60 + Number(match[3] ?? 0)) * 60000 * (match[1] === "+" ? 1 : -1);
    instant = utcCalendarMidnight - offsetMs;
  }
  return instant / 1000;
}

export function getTelegramTaskDayInterval(nowSec: number): { startSec: number; endSec: number } {
  const parts = calendar.formatToParts(nowSec * 1000);
  const value = (type: string) => Number(parts.find((part) => part.type === type)!.value);
  const midnight = Date.UTC(value("year"), value("month") - 1, value("day"));
  return { startSec: midnightUnixSec(midnight), endSec: midnightUnixSec(midnight + 86400000) };
}

const clock = new Intl.DateTimeFormat("en-US", {
  timeZone: TELEGRAM_TASK_TIME_ZONE,
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
});

/** Kyiv calendar date (YYYY-MM-DD) and hour 0–23 for an instant, independent of the host timezone. */
export function getKyivClock(nowSec: number): { date: string; hour: number } {
  const parts = clock.formatToParts(nowSec * 1000);
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return { date: `${value("year")}-${value("month")}-${value("day")}`, hour: Number(value("hour")) % 24 };
}
