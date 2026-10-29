export type RelativeAgo =
  | { kind: "never" }
  | { kind: "just" }
  | { kind: "minutes"; count: number }
  | { kind: "hours"; count: number }
  | { kind: "days"; count: number }
  | { kind: "months"; count: number }
  | { kind: "years"; count: number };

const HOUR_MINUTES = 60;
const DAY_MINUTES = 24 * HOUR_MINUTES;
/** Hours stay hours through 48, then the count switches to days. */
const MAX_HOUR_COUNT = 48;
/** About thirty days, then months. Twelve such months become years. */
const MONTH_DAYS = 30;
const YEAR_MONTHS = 12;

type Language = "uk" | "en" | "de";

function language(locale: string): Language {
  const code = locale.toLowerCase();
  if (code.startsWith("en")) return "en";
  if (code.startsWith("de")) return "de";
  return "uk";
}

/** Ukrainian cardinal: день/дні/днів, місяць/місяці/місяців, рік/роки/років. */
export function ukCountForm(count: number, one: string, few: string, many: string): string {
  const n = Math.abs(Math.trunc(count));
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function enCount(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/**
 * Bucket a minute delta from MySQL `TIMESTAMPDIFF`.
 * Under a minute is «щойно». Hours stop at 48. Days stop before 30.
 * Months are blocks of 30 days; 12 of them are a year.
 */
export function relativeAgo(minutes: number | null | undefined): RelativeAgo {
  if (minutes == null || !Number.isFinite(minutes)) return { kind: "never" };
  if (minutes < 1) return { kind: "just" };
  const whole = Math.floor(minutes);
  if (whole < HOUR_MINUTES) return { kind: "minutes", count: whole };
  const hours = Math.floor(whole / HOUR_MINUTES);
  if (hours <= MAX_HOUR_COUNT) return { kind: "hours", count: hours };
  const days = Math.floor(whole / DAY_MINUTES);
  if (days < MONTH_DAYS) return { kind: "days", count: days };
  const months = Math.floor(days / MONTH_DAYS);
  if (months < YEAR_MONTHS) return { kind: "months", count: months };
  return { kind: "years", count: Math.floor(months / YEAR_MONTHS) };
}

function phrase(age: Exclude<RelativeAgo, { kind: "never" }>, lang: Language): string {
  if (age.kind === "just") {
    if (lang === "en") return "just now";
    if (lang === "de") return "gerade eben";
    return "щойно";
  }
  const count = age.count;
  if (age.kind === "minutes") {
    if (lang === "en") return `${count} ${enCount(count, "minute", "minutes")} ago`;
    if (lang === "de") return `vor ${count} ${count === 1 ? "Minute" : "Minuten"}`;
    return `${count} хв тому`;
  }
  if (age.kind === "hours") {
    if (lang === "en") return `${count} ${enCount(count, "hour", "hours")} ago`;
    if (lang === "de") return `vor ${count} ${count === 1 ? "Stunde" : "Stunden"}`;
    return `${count} год тому`;
  }
  if (age.kind === "days") {
    if (lang === "en") return `${count} ${enCount(count, "day", "days")} ago`;
    if (lang === "de") return `vor ${count} ${count === 1 ? "Tag" : "Tagen"}`;
    return `${count} ${ukCountForm(count, "день", "дні", "днів")} тому`;
  }
  if (age.kind === "months") {
    if (lang === "en") return `${count} ${enCount(count, "month", "months")} ago`;
    if (lang === "de") return `vor ${count} ${count === 1 ? "Monat" : "Monaten"}`;
    return `${count} ${ukCountForm(count, "місяць", "місяці", "місяців")} тому`;
  }
  if (lang === "en") return `${count} ${enCount(count, "year", "years")} ago`;
  if (lang === "de") return `vor ${count} ${count === 1 ? "Jahr" : "Jahren"}`;
  return `${count} ${ukCountForm(count, "рік", "роки", "років")} тому`;
}

/** Relative label for admin. `null` when there is no stamp. */
export function formatRelativeAgo(
  minutes: number | null | undefined,
  locale: string,
): string | null {
  const age = relativeAgo(minutes);
  if (age.kind === "never") return null;
  return phrase(age, language(locale));
}

/** Hour and minute in Europe/Kyiv, 24-hour, for a short «saved at» line. */
export function formatKyivClock(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Europe/Kyiv",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** Exact Europe/Kyiv date and time for a tooltip or a meta line. */
export function formatKyivDateTime(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
