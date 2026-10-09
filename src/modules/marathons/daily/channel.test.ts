import assert from "node:assert/strict";
import test from "node:test";
import { notifyFlags } from "./channel";
import { planNotifications } from "./notifications";

const person = {
  userId: 7,
  email: "a@example.com",
  displayName: "Марія",
  telegramChatId: "100",
  notifyEmail: true,
  notifyBot: true,
  completedDayNumbers: [] as number[],
};

test("telegram without a linked bot falls back to email", () => {
  const flags = notifyFlags({ channel: "telegram", linked: false, paused: false });
  assert.deepEqual(flags, { notifyEmail: true, notifyBot: false });
  const planned = planNotifications({
    now: new Date("2026-01-10T07:30:00.000Z"),
    marathonId: 3,
    startDate: "2026-01-10",
    unlockHour: "09:00",
    daysCount: 5,
    people: [{ ...person, ...flags, telegramChatId: null }],
  });
  assert.ok(planned.length > 0);
  assert.ok(planned.every((item) => item.channel === "email"));
});

test("a linked telegram choice uses the bot and silence stops both", () => {
  assert.deepEqual(
    notifyFlags({ channel: "telegram", linked: true, paused: false }),
    { notifyEmail: false, notifyBot: true },
  );
  assert.deepEqual(
    notifyFlags({ channel: "site", linked: true, paused: false }),
    { notifyEmail: true, notifyBot: false },
  );
  const silent = notifyFlags({ channel: "telegram", linked: true, paused: true });
  const planned = planNotifications({
    now: new Date("2026-01-10T07:30:00.000Z"),
    marathonId: 3,
    startDate: "2026-01-10",
    unlockHour: "09:00",
    daysCount: 1,
    people: [{ ...person, ...silent }],
  });
  assert.deepEqual(planned, []);
});
