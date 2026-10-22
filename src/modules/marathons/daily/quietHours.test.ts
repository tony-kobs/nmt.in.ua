import assert from "node:assert/strict";
import test from "node:test";
import { dayOpenPrompt, runMarathonNotifications, sendRankNotice } from "./notificationsJob";
import type { NotifyAudienceMarathon } from "./store";

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

const quietNight = new Date("2026-01-10T21:30:00.000Z");

test("marathon telegram waits out quiet hours and mail still goes", async () => {
  const telegram: string[] = [];
  const released: string[] = [];
  const confirmed: string[] = [];
  const result = await runMarathonNotifications({
    now: () => quietNight,
    load: async () => [audience],
    telegramEnabled: true,
    secret: "test-secret",
    loadBoard: async () => [],
    skipSiteDay: true,
    holdTelegram: async () => true,
    sendTelegram: async () => {
      telegram.push("sent");
      return true;
    },
    sendEmail: async () => true,
    claim: async () => "claimed",
    release: async (intent) => { released.push(`${intent.channel}:${intent.kind}`); },
    confirm: async (intent) => { confirmed.push(`${intent.channel}:${intent.kind}`); },
  });
  assert.deepEqual(telegram, []);
  assert.equal(released.includes("telegram:day_open"), false);
  assert.ok(released.includes("telegram:reminder"));
  assert.equal(confirmed.includes("email:day_open"), false);
  assert.ok(confirmed.includes("email:reminder"));
  assert.equal(result.failed, 0);
  assert.ok(result.skipped >= 1);
  assert.ok(result.sent >= 1);
});

test("the same marathon telegram is sent once quiet hours are over", async () => {
  const telegram: string[] = [];
  const result = await runMarathonNotifications({
    now: () => new Date("2026-01-10T07:30:00.000Z"),
    load: async () => [audience],
    telegramEnabled: true,
    secret: "test-secret",
    loadBoard: async () => [],
    skipSiteDay: true,
    holdTelegram: async () => false,
    sendTelegram: async (_chatId, text) => {
      telegram.push(text);
      return true;
    },
    sendEmail: async () => true,
    claim: async () => "claimed",
    release: async () => {},
    confirm: async () => {},
  });
  assert.ok(telegram.length >= 1);
  assert.equal(result.failed, 0);
  assert.ok(result.sent >= 1);
});

test("day open queues one short message with a start button", async () => {
  const queued: Array<{ text: string; data?: string; label?: string }> = [];
  const result = await runMarathonNotifications({
    now: () => new Date("2026-01-10T07:30:00.000Z"),
    load: async () => [audience],
    telegramEnabled: true,
    secret: "test-secret",
    loadBoard: async () => [],
    skipSiteDay: true,
    holdTelegram: async () => false,
    enqueueTelegram: async (replies) => {
      for (const reply of replies) {
        const button = reply.replyMarkup?.inline_keyboard[0]?.[0];
        queued.push({ text: reply.text, data: button?.callback_data, label: button?.text });
      }
    },
    sendEmail: async () => true,
    claim: async () => "claimed",
    release: async () => {},
    confirm: async () => {},
  });
  assert.equal(queued.length, 1);
  assert.match(queued[0]!.text, /Відкрито день/);
  assert.equal(queued[0]!.text.includes("Прочитайте"), false);
  assert.equal(queued[0]!.data, "mh:today");
  assert.equal(queued[0]!.label, "Почати");
  assert.equal(result.failed, 0);
  const prompt = dayOpenPrompt({ chatId: "100", text: "Відкрито день 1", dayNumber: 1, beginLabel: "  " });
  assert.equal(prompt.replyMarkup?.inline_keyboard[0]?.[0]?.text, "Почати");
});

test("a rank change is queued as a system send during quiet hours and skipped when the bot already replied", async () => {
  const queued: Array<{ text: string; trigger?: string }> = [];
  const person = { ...audience.people[0]!, notifyEmail: false, email: null };
  const text = await sendRankNotice({
    marathonId: 3,
    slug: "vesna",
    copy: {},
    person,
    dayNumber: 1,
    place: 2,
    prevPlace: 4,
    points: 8,
    holdTelegram: async () => true,
    enqueueTelegram: async (replies) => {
      queued.push(...replies.map((reply) => ({ text: reply.text, trigger: reply.trigger })));
    },
  });
  assert.equal(queued.length, 1);
  assert.equal(queued[0]!.trigger, "system");
  assert.match(queued[0]!.text, /2/);
  assert.equal(text, queued[0]!.text);

  queued.length = 0;
  await sendRankNotice({
    marathonId: 3,
    slug: "vesna",
    copy: {},
    person,
    dayNumber: 1,
    place: 2,
    prevPlace: 4,
    points: 8,
    skipTelegram: true,
    holdTelegram: async () => {
      throw new Error("quiet hours must not run for a bot reply");
    },
    enqueueTelegram: async () => {
      throw new Error("a bot reply must not be queued");
    },
  });
  assert.deepEqual(queued, []);
});
