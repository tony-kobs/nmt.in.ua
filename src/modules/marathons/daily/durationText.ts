const UNITS = {
  uk: { h: "год", m: "хв", s: "с" },
  en: { h: "h", m: "min", s: "s" },
  de: { h: "Std.", m: "Min.", s: "s" },
} as const;

export type DurationLocale = keyof typeof UNITS;

export function durationLocale(locale: string): DurationLocale {
  if (locale === "en" || locale === "de" || locale === "uk") return locale;
  return "uk";
}

/** Seconds from the first open of the day's tasks until submit. Unknown when the start was never stored. */
export function durationSeconds(startedAtMs: number | null, submittedAtMs: number): number | null {
  if (startedAtMs == null || !Number.isFinite(startedAtMs) || !Number.isFinite(submittedAtMs)) return null;
  if (submittedAtMs < startedAtMs) return null;
  const seconds = Math.floor((submittedAtMs - startedAtMs) / 1000);
  if (!Number.isSafeInteger(seconds) || seconds < 0) return null;
  return seconds;
}

/**
 * Sum of a participant's submitted days.
 * One missing duration makes the total unknown, so a partial sum cannot win a tie.
 */
export function totalKnownSeconds(values: readonly (number | null | undefined)[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const value of values) {
    if (value == null || !Number.isFinite(value) || value < 0) return null;
    sum += Math.floor(value);
  }
  return sum;
}

export function averageAndMedian(values: readonly number[]): { avg: number | null; median: number | null } {
  const samples = values.filter((value) => Number.isFinite(value) && value >= 0).map((value) => Math.floor(value));
  if (samples.length === 0) return { avg: null, median: null };
  const avg = Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length);
  const sorted = [...samples].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
  return { avg, median };
}

/** `12 хв 30 с`. Zero is a real duration. Null stays empty so the caller can say the time is unknown. */
export function formatMarathonDuration(seconds: number | null, locale: DurationLocale = "uk"): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "";
  const whole = Math.min(Math.floor(seconds), 99 * 3600);
  const unit = UNITS[locale];
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${unit.h}`);
  if (minutes > 0) parts.push(`${minutes} ${unit.m}`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs} ${unit.s}`);
  return parts.join(" ");
}

export function botDayTimeNote(daySec: number | null, totalSec: number | null): string {
  const day = daySec == null ? "невідомий" : formatMarathonDuration(daySec, "uk");
  const total = totalSec == null ? "невідомий" : formatMarathonDuration(totalSec, "uk");
  return `Час цього дня: ${day}\nЗагальний час: ${total}`;
}
