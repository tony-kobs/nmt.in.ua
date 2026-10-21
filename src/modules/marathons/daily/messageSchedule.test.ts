import assert from "node:assert/strict";
import test from "node:test";
import { runMarathonNotifications, sendRankNotice } from "./notificationsJob";
import type { NotifyAudienceMarathon } from "./store";
import type { SlotOverride } from "./messageTimeline";

const audience: NotifyAudienceMarathon = {
  marathonId: 3,
  slug: "vesna",
  title: "Весна",
  startDate: "2026-01-10",
  unlockHour: "09:00",
  reminderHour: "19:00",
  nudgeFrom: 10,
  nudgeUntil: 21,
  daysCount: 5,
  contentDayNumbers: [1, 2, 3, 4, 5],
  topics: { 1: "Дроби" },
  copy: {},
  people: [{
    userId: 7,
    email: "a@example.com",
    displayName: "Іра",
    telegramChatId: "100",
    notifyEmail: true,
    notifyBot: true,
    channel: "telegram",
    completedDayNumbers: [],
  }],
};

const hooks = {
  load: async () => [audience],
  telegramEnabled: true,
  secret: "test-secret",
  loadBoard: async () => [],
  skipSiteDay: true,
  holdTelegram: async () => false,
  claim: async () => "claimed" as const,
  release: async () => {},
  confirm: async () => {},
  sendEmail: async () => true,
};

test("a cancelled telegram slot is closed and not sent", async () => {
  const telegram: string[] = [];
  const overrides: SlotOverride[] = [{
    marathonId: 3,
    dayNumber: 1,
    kind: "day_open",
    channel: "telegram",
    cancelled: true,
    sendAt: null,
    body: null,
  }];
  await runMarathonNotifications({
    ...hooks,
    now: () => new Date("2026-01-10T21:30:00.000Z"),
    overrides,
    sendTelegram: async (_chatId, text) => {
      telegram.push(text);
      return true;
    },
  });
  assert.equal(telegram.some((text) => text.startsWith("Відкрито день")), false);
  assert.equal(telegram.some((text) => text.startsWith("Нагадування")), true);
});

test("a postponed slot waits, then uses the override text inside its window", async () => {
  const early: string[] = [];
  const sendAt = new Date("2026-01-13T07:00:00.000Z");
  const overrides: SlotOverride[] = [{
    marathonId: 3,
    dayNumber: 1,
    kind: "day_open",
    channel: "telegram",
    cancelled: false,
    sendAt,
    body: "Пізніше {topic}",
  }];
  await runMarathonNotifications({
    ...hooks,
    now: () => new Date("2026-01-12T08:00:00.000Z"),
    overrides,
    sendTelegram: async (_chatId, text) => {
      early.push(text);
      return true;
    },
  });
  assert.equal(early.some((text) => text.startsWith("Пізніше")), false);

  const due: string[] = [];
  await runMarathonNotifications({
    ...hooks,
    now: () => new Date("2026-01-13T08:00:00.000Z"),
    overrides,
    sendTelegram: async (_chatId, text) => {
      due.push(text);
      return true;
    },
  });
  assert.equal(due.some((text) => text === "Пізніше Дроби"), true);
});

test("an archived marathon is excluded from email and telegram sends", async () => {
  const telegram: string[] = [];
  const email: string[] = [];
  const result = await runMarathonNotifications({
    ...hooks,
    load: async () => [{ ...audience, status: "archived" }],
    now: () => new Date("2026-01-10T21:30:00.000Z"),
    sendTelegram: async () => {
      telegram.push("sent");
      return true;
    },
    sendEmail: async () => {
      email.push("sent");
      return true;
    },
  });
  assert.deepEqual(telegram, []);
  assert.deepEqual(email, []);
  assert.equal(result.sent, 0);
});

test("a cancelled or postponed rank notice is not handed to Telegram", async () => {
  const person = { ...audience.people[0]!, notifyEmail: false, email: null };
  const queued: string[] = [];
  const jobs: string[] = [];
  const cancelled = await sendRankNotice({
    marathonId: 3,
    slug: "vesna",
    copy: {},
    person,
    dayNumber: 1,
    place: 2,
    prevPlace: 4,
    points: 8,
    slotOverrides: [{
      marathonId: 3,
      dayNumber: 1,
      kind: "rank",
      channel: "telegram",
      cancelled: true,
      sendAt: null,
      body: null,
    }],
    enqueueTelegram: async () => {
      throw new Error("cancelled rank must not be queued");
    },
    holdTelegram: async () => {
      throw new Error("cancelled rank must not ask about quiet hours");
    },
  });
  assert.equal(cancelled, "");

  const postponed = await sendRankNotice({
    marathonId: 3,
    slug: "vesna",
    copy: {},
    person,
    dayNumber: 1,
    place: 2,
    prevPlace: 4,
    points: 8,
    now: new Date("2026-01-10T12:00:00.000Z"),
    slotOverrides: [{
      marathonId: 3,
      dayNumber: 1,
      kind: "rank",
      channel: "telegram",
      cancelled: false,
      sendAt: new Date("2026-01-11T15:00:00.000Z"),
      body: "Місце {place} пізніше",
    }],
    enqueueTelegram: async () => {
      queued.push("telegram");
    },
    enqueueJob: async (job) => {
      jobs.push(job.body);
    },
    holdTelegram: async () => {
      throw new Error("a postponed rank must not check quiet hours yet");
    },
  });
  assert.equal(postponed, "");
  assert.deepEqual(queued, []);
  assert.deepEqual(jobs, ["Місце 2 пізніше"]);
});
