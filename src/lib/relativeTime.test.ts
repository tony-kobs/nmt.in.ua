import assert from "node:assert/strict";
import test from "node:test";
import { formatKyivDateTime, formatRelativeAgo, relativeAgo, ukCountForm } from "./relativeTime";

const HOUR = 60;
const DAY = 24 * HOUR;

test("ukCountForm uses день/дні/днів, місяць/місяці/місяців and рік/роки/років", () => {
  const day = (n: number) => ukCountForm(n, "день", "дні", "днів");
  const month = (n: number) => ukCountForm(n, "місяць", "місяці", "місяців");
  const year = (n: number) => ukCountForm(n, "рік", "роки", "років");
  assert.equal(day(1), "день");
  assert.equal(day(2), "дні");
  assert.equal(day(3), "дні");
  assert.equal(day(4), "дні");
  assert.equal(day(5), "днів");
  assert.equal(day(11), "днів");
  assert.equal(day(12), "днів");
  assert.equal(day(14), "днів");
  assert.equal(day(21), "день");
  assert.equal(day(22), "дні");
  assert.equal(day(25), "днів");
  assert.equal(month(1), "місяць");
  assert.equal(month(2), "місяці");
  assert.equal(month(5), "місяців");
  assert.equal(month(11), "місяців");
  assert.equal(month(22), "місяці");
  assert.equal(year(1), "рік");
  assert.equal(year(2), "роки");
  assert.equal(year(4), "роки");
  assert.equal(year(5), "років");
  assert.equal(year(11), "років");
  assert.equal(year(21), "рік");
  assert.equal(year(111), "років");
});

test("relativeAgo boundaries: just now, minutes, 48 hours, then days, months, years", () => {
  assert.deepEqual(relativeAgo(null), { kind: "never" });
  assert.deepEqual(relativeAgo(undefined), { kind: "never" });
  assert.deepEqual(relativeAgo(Number.NaN), { kind: "never" });
  assert.deepEqual(relativeAgo(0), { kind: "just" });
  assert.deepEqual(relativeAgo(0.9), { kind: "just" });
  assert.deepEqual(relativeAgo(1), { kind: "minutes", count: 1 });
  assert.deepEqual(relativeAgo(59), { kind: "minutes", count: 59 });
  assert.deepEqual(relativeAgo(HOUR), { kind: "hours", count: 1 });
  assert.deepEqual(relativeAgo(48 * HOUR), { kind: "hours", count: 48 });
  assert.deepEqual(relativeAgo(48 * HOUR + 59), { kind: "hours", count: 48 });
  assert.deepEqual(relativeAgo(49 * HOUR), { kind: "days", count: 2 });
  assert.deepEqual(relativeAgo(3 * DAY), { kind: "days", count: 3 });
  assert.deepEqual(relativeAgo(29 * DAY), { kind: "days", count: 29 });
  assert.deepEqual(relativeAgo(30 * DAY), { kind: "months", count: 1 });
  assert.deepEqual(relativeAgo(60 * DAY), { kind: "months", count: 2 });
  assert.deepEqual(relativeAgo(11 * 30 * DAY), { kind: "months", count: 11 });
  assert.deepEqual(relativeAgo(12 * 30 * DAY), { kind: "years", count: 1 });
  assert.deepEqual(relativeAgo(24 * 30 * DAY), { kind: "years", count: 2 });
});

test("Ukrainian phrases use the plural that matches the count", () => {
  assert.equal(formatRelativeAgo(0, "uk"), "щойно");
  assert.equal(formatRelativeAgo(4, "uk"), "4 хв тому");
  assert.equal(formatRelativeAgo(HOUR, "uk"), "1 год тому");
  assert.equal(formatRelativeAgo(48 * HOUR, "uk"), "48 год тому");
  assert.equal(formatRelativeAgo(3 * DAY, "uk"), "3 дні тому");
  assert.equal(formatRelativeAgo(5 * DAY, "uk"), "5 днів тому");
  assert.equal(formatRelativeAgo(21 * DAY, "uk"), "21 день тому");
  assert.equal(formatRelativeAgo(22 * DAY, "uk"), "22 дні тому");
  assert.equal(formatRelativeAgo(11 * DAY, "uk"), "11 днів тому");
  assert.equal(formatRelativeAgo(30 * DAY, "uk"), "1 місяць тому");
  assert.equal(formatRelativeAgo(2 * 30 * DAY, "uk"), "2 місяці тому");
  assert.equal(formatRelativeAgo(5 * 30 * DAY, "uk"), "5 місяців тому");
  assert.equal(formatRelativeAgo(11 * 30 * DAY, "uk"), "11 місяців тому");
  assert.equal(formatRelativeAgo(12 * 30 * DAY, "uk"), "1 рік тому");
  assert.equal(formatRelativeAgo(2 * 12 * 30 * DAY, "uk"), "2 роки тому");
  assert.equal(formatRelativeAgo(5 * 12 * 30 * DAY, "uk"), "5 років тому");
  assert.equal(formatRelativeAgo(11 * 12 * 30 * DAY, "uk"), "11 років тому");
  assert.equal(formatRelativeAgo(21 * 12 * 30 * DAY, "uk"), "21 рік тому");
  assert.equal(formatRelativeAgo(null, "uk"), null);
});

test("English and German switch the singular at one", () => {
  assert.equal(formatRelativeAgo(0, "en"), "just now");
  assert.equal(formatRelativeAgo(1, "en"), "1 minute ago");
  assert.equal(formatRelativeAgo(2, "en"), "2 minutes ago");
  assert.equal(formatRelativeAgo(HOUR, "en"), "1 hour ago");
  assert.equal(formatRelativeAgo(3 * DAY, "en"), "3 days ago");
  assert.equal(formatRelativeAgo(2 * 30 * DAY, "en"), "2 months ago");
  assert.equal(formatRelativeAgo(12 * 30 * DAY, "en"), "1 year ago");
  assert.equal(formatRelativeAgo(0, "de"), "gerade eben");
  assert.equal(formatRelativeAgo(1, "de"), "vor 1 Minute");
  assert.equal(formatRelativeAgo(3 * DAY, "de"), "vor 3 Tagen");
  assert.equal(formatRelativeAgo(2 * 30 * DAY, "de"), "vor 2 Monaten");
  assert.equal(formatRelativeAgo(2 * 12 * 30 * DAY, "de"), "vor 2 Jahren");
});

test("formatKyivDateTime shows the Kyiv wall clock, not UTC", () => {
  const winter = formatKyivDateTime("2026-01-10T07:00:00.000Z", "uk");
  assert.match(winter, /09:00/);
  assert.match(winter, /січня/);
  assert.match(winter, /2026/);
  const summer = formatKyivDateTime("2026-07-10T06:00:00.000Z", "uk");
  assert.match(summer, /09:00/);
  assert.match(summer, /липня/);
});
