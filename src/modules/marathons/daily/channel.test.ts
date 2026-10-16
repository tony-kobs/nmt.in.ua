import assert from "node:assert/strict";
import test from "node:test";
import { notifyFlags, personNotifyChannels } from "./channel";
import { planNotifications, planSiteDayOpens } from "./notifications";

const person = {
  userId: 7,
  email: "a@example.com",
  displayName: "Марія",
  telegramChatId: "100",
  notifyEmail: true,
  notifyBot: true,
  completedDayNumbers: [] as number[],
};

test("email and telegram toggles are independent and a pause silences both", () => {
  assert.deepEqual(notifyFlags({ email: true, telegram: true, paused: false }), {
    notifyEmail: true,
    notifyBot: true,
  });
  assert.deepEqual(notifyFlags({ email: false, telegram: true, paused: false }), {
    notifyEmail: false,
    notifyBot: true,
  });
  assert.deepEqual(notifyFlags({ email: true, telegram: true, paused: true }), {
    notifyEmail: false,
    notifyBot: false,
  });
});

test("a linked participant can receive email and telegram together", () => {
  assert.deepEqual(personNotifyChannels(person), ["email", "telegram"]);
  const planned = planNotifications({
    now: new Date("2026-01-10T07:30:00.000Z"),
    marathonId: 3,
    startDate: "2026-01-10",
    unlockHour: "09:00",
    daysCount: 5,
    people: [person],
  });
  const channels = planned
    .filter((item) => item.kind === "day_open")
    .map((item) => item.channel)
    .sort();
  assert.deepEqual(channels, ["email", "telegram"]);
});

test("telegram waits for a linked bot and email follows its own toggle", () => {
  assert.deepEqual(
    personNotifyChannels({ ...person, telegramChatId: null }),
    ["email"],
  );
  assert.deepEqual(
    personNotifyChannels({ ...person, notifyEmail: false }),
    ["telegram"],
  );
  assert.deepEqual(
    personNotifyChannels({ ...person, notifyBot: false, telegramChatId: null }),
    ["email"],
  );
  const planned = planNotifications({
    now: new Date("2026-01-10T07:30:00.000Z"),
    marathonId: 3,
    startDate: "2026-01-10",
    unlockHour: "09:00",
    daysCount: 1,
    people: [{ ...person, notifyEmail: false, paused: true }],
  });
  assert.deepEqual(planned, []);
});

test("a decline sends no email or telegram, while the site day note stays for participants", () => {
  assert.deepEqual(personNotifyChannels({ ...person, declined: true }), []);
  const planned = planNotifications({
    now: new Date("2026-01-10T07:30:00.000Z"),
    marathonId: 3,
    startDate: "2026-01-10",
    unlockHour: "09:00",
    daysCount: 1,
    people: [{ ...person, declined: true }],
  });
  assert.deepEqual(planned, []);
  const site = planSiteDayOpens({
    now: new Date("2026-01-10T07:30:00.000Z"),
    startDate: "2026-01-10",
    unlockHour: "09:00",
    daysCount: 1,
    people: [
      { userId: 7, completedDayNumbers: [] },
      { userId: 8, declined: true, completedDayNumbers: [] },
      { userId: 9, completedDayNumbers: [1] },
    ],
  });
  assert.deepEqual(site, [{ userId: 7, dayNumber: 1 }]);
});
