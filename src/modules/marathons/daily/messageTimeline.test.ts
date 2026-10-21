import assert from "node:assert/strict";
import test from "node:test";
import {
  audienceFor,
  buildMessageTimeline,
  decideSlot,
  deliveryErrorText,
  deriveTimelineStatus,
  gateIntents,
  scheduleSkipReason,
  SKIP_REASON_TEXT,
  type TimelinePerson,
} from "./messageTimeline";

const person = (patch: Partial<TimelinePerson> = {}): TimelinePerson => ({
  email: "a@example.com",
  telegramChatId: "100",
  notifyEmail: true,
  notifyBot: true,
  completedDayNumbers: [],
  ...patch,
});

const schedule = {
  startDate: "2026-01-10",
  unlockHour: "09:00",
  reminderHour: "19:00",
  nudgeFrom: 10,
  nudgeUntil: 21,
  days: [
    { dayNumber: 1, topic: "Дроби" },
    { dayNumber: 2, topic: "Відсотки" },
  ],
};

test("timeline groups by Kyiv day and keeps opt-out users out of the count", () => {
  const people = [
    person(),
    person({ email: "paused@example.com", telegramChatId: "200", paused: true }),
    person({ email: "mail-only@example.com", telegramChatId: null, notifyBot: false }),
  ];
  const days = buildMessageTimeline({
    schedule,
    linkBase: "https://nmt.in.ua/marathon/vesna",
    people,
    ledger: [],
    overrides: [],
    outbox: [],
    jobs: [],
  });
  assert.ok(days.length >= 2);
  const flat = days.flatMap((day) => day.items);
  const openMail = flat.find((item) => item.kind === "day_open" && item.channel === "email" && item.dayNumber === 1);
  const openBot = flat.find((item) => item.kind === "day_open" && item.channel === "telegram" && item.dayNumber === 1);
  assert.equal(openMail?.audience, 2);
  assert.equal(openBot?.audience, 1);
  assert.match(openMail?.preview ?? "", /Дроби/);
  assert.equal(openMail?.status, "planned");
  assert.equal(openMail?.editable, true);
  const times = flat.map((item) => item.effectiveAt);
  assert.deepEqual(times, [...times].sort());
  for (const day of days) {
    const dates = new Set(day.items.map((item) => item.effectiveAt.slice(0, 10)));
    assert.ok(dates.size >= 1);
  }
});

test("a sent slot is read-only and a cancellation stays on the record", () => {
  const days = buildMessageTimeline({
    schedule,
    linkBase: "https://nmt.in.ua/marathon/vesna",
    people: [person({ completedDayNumbers: [1] })],
    ledger: [{ dayNumber: 1, kind: "day_open", channel: "email", sent: 1, pending: 0 }],
    overrides: [{ dayNumber: 1, kind: "reminder", channel: "telegram", cancelled: true, sendAt: null, body: null }],
    outbox: [],
    jobs: [],
  });
  const flat = days.flatMap((day) => day.items);
  const sent = flat.find((item) => item.kind === "day_open" && item.channel === "email" && item.dayNumber === 1);
  assert.equal(sent?.status, "sent");
  assert.equal(sent?.editable, false);
  const cancelled = flat.find((item) => item.kind === "reminder" && item.channel === "telegram");
  assert.equal(cancelled?.status, "cancelled");
  assert.equal(cancelled?.editable, false);
});

test("overrides change the preview and the effective time", () => {
  const sendAt = new Date("2026-01-12T07:00:00.000Z");
  const days = buildMessageTimeline({
    schedule,
    linkBase: "https://nmt.in.ua/marathon/vesna",
    people: [person()],
    ledger: [],
    overrides: [{
      dayNumber: 1,
      kind: "day_open",
      channel: "telegram",
      cancelled: false,
      sendAt,
      body: "Свій текст дня {day}",
    }],
    outbox: [{
      id: 9,
      status: "pending",
      notBefore: sendAt,
      createdAt: new Date("2026-01-10T07:00:00.000Z"),
      text: "Черга: матеріали",
      dayNumber: 1,
      kind: "day_open",
    }],
    jobs: [],
  });
  const flat = days.flatMap((day) => day.items);
  const edited = flat.find((item) => item.key === "1:day_open:telegram");
  assert.equal(edited?.effectiveAt, sendAt.toISOString());
  assert.match(edited?.preview ?? "", /Свій текст дня 1/);
  const queued = flat.find((item) => item.key === "outbox:9");
  assert.equal(queued?.status, "queued");
  assert.equal(queued?.editable, true);
  assert.match(queued?.preview ?? "", /матеріали/);
});

test("decideSlot and gateIntents keep cancellations and delay postponements", () => {
  const now = new Date("2026-01-10T08:00:00.000Z");
  assert.equal(decideSlot(null, now), "send");
  assert.equal(decideSlot({ cancelled: true, sendAt: null }, now), "cancel");
  assert.equal(decideSlot({ cancelled: false, sendAt: new Date("2026-01-11T08:00:00.000Z") }, now), "wait");
  assert.equal(decideSlot({ cancelled: false, sendAt: new Date("2026-01-10T07:00:00.000Z") }, now), "send");

  const natural = [{
    marathonId: 3, userId: 7, dayNumber: 1, kind: "day_open" as const, channel: "telegram" as const,
  }];
  const moved = gateIntents(natural, [{
    dayNumber: 1, kind: "day_open", channel: "telegram", cancelled: false,
    sendAt: new Date("2026-01-12T07:00:00.000Z"), body: null,
  }], now, natural);
  assert.equal(moved.length, 0);
  const due = gateIntents(natural, [{
    dayNumber: 1, kind: "day_open", channel: "telegram", cancelled: false,
    sendAt: new Date("2026-01-10T07:30:00.000Z"), body: null,
  }], now, natural);
  assert.equal(due.length, 1);
  const cancelled = gateIntents(natural, [{
    dayNumber: 1, kind: "day_open", channel: "telegram", cancelled: true, sendAt: null, body: null,
  }], now);
  assert.equal(cancelled.length, 1);
  const otherMarathon = gateIntents(natural, [{
    marathonId: 9,
    dayNumber: 1, kind: "day_open", channel: "telegram", cancelled: false,
    sendAt: new Date("2026-01-12T07:00:00.000Z"), body: null,
  }], now, natural);
  assert.equal(otherMarathon.length, 1);
});

test("audience ignores a paused participant", () => {
  assert.equal(audienceFor([
    person(),
    person({ paused: true, email: "b@example.com" }),
  ], 1, "reminder", "email", 2), 1);
});

test("an archived course keeps sent rows and skips the rest", () => {
  const days = buildMessageTimeline({
    schedule,
    linkBase: "https://nmt.in.ua/marathon/vesna",
    people: [person()],
    ledger: [{ dayNumber: 1, kind: "day_open", channel: "telegram", sent: 1, pending: 0 }],
    overrides: [{ dayNumber: 1, kind: "reminder", channel: "email", cancelled: true, sendAt: null, body: null }],
    outbox: [],
    jobs: [],
    hold: true,
  });
  const items = days.flatMap((day) => day.items);
  const sent = items.filter((item) => item.status === "sent");
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.editable, false);
  const cancelled = items.find((item) => item.kind === "reminder" && item.channel === "email");
  assert.equal(cancelled?.status, "cancelled");
  assert.equal(cancelled?.editable, false);
  const skipped = items.filter((item) => item !== sent[0] && item !== cancelled);
  assert.ok(skipped.length > 0);
  assert.ok(skipped.every((item) => item.status === "skipped" && !item.editable));
  assert.ok(skipped.every((item) => item.reason === SKIP_REASON_TEXT.archived));
});

test("deriveTimelineStatus names each delivery state", () => {
  const base = { audience: 2, sent: 0, pending: 0, failed: 0 };
  assert.equal(deriveTimelineStatus(base), "planned");
  assert.equal(deriveTimelineStatus({ ...base, pending: 1 }), "queued");
  assert.equal(deriveTimelineStatus({ ...base, postponed: true }), "postponed");
  assert.equal(deriveTimelineStatus({ ...base, quiet: true, pending: 1 }), "quiet");
  assert.equal(deriveTimelineStatus({ ...base, postponed: true, quiet: true }), "postponed");
  assert.equal(deriveTimelineStatus({ ...base, sent: 2 }), "sent");
  assert.equal(deriveTimelineStatus({ ...base, audience: 0, sent: 1 }), "sent");
  assert.equal(deriveTimelineStatus({ ...base, sent: 1, failed: 1 }), "partial");
  assert.equal(deriveTimelineStatus({ ...base, failed: 2 }), "failed");
  assert.equal(deriveTimelineStatus({ ...base, failed: 1, pending: 1 }), "queued");
  assert.equal(deriveTimelineStatus({ ...base, skip: "opt_out" }), "skipped");
  assert.equal(deriveTimelineStatus({ ...base, skip: "no_telegram" }), "skipped");
  assert.equal(deriveTimelineStatus({ ...base, archived: true }), "skipped");
  assert.equal(deriveTimelineStatus({ ...base, archived: true, sent: 1 }), "sent");
  assert.equal(deriveTimelineStatus({ ...base, cancelled: true, archived: true }), "cancelled");
  assert.equal(deriveTimelineStatus({ ...base, audience: 0 }), "planned");
});

test("a postponed slot, a quiet row and a partial send keep their facts", () => {
  const sendAt = new Date("2026-01-12T15:00:00.000Z");
  const sentAt = new Date("2026-01-10T07:05:00.000Z");
  const days = buildMessageTimeline({
    schedule,
    linkBase: "https://nmt.in.ua/marathon/vesna",
    people: [person(), person({ email: "b@example.com", telegramChatId: "200" })],
    ledger: [{
      dayNumber: 1,
      kind: "reminder",
      channel: "email",
      sent: 1,
      pending: 0,
      failed: 1,
      sentAt,
      errorText: "Помилка Brevo",
    }],
    failures: [{
      dayNumber: 1,
      kind: "reminder",
      channel: "email",
      who: "Оля",
      reason: "Помилка Brevo",
    }],
    overrides: [{
      dayNumber: 1,
      kind: "day_open",
      channel: "telegram",
      cancelled: false,
      sendAt,
      body: null,
    }],
    outbox: [{
      id: 4,
      status: "pending",
      notBefore: new Date("2026-01-10T20:00:00.000Z"),
      createdAt: new Date("2026-01-10T07:00:00.000Z"),
      text: "Тиша",
      dayNumber: 1,
      kind: "day_open",
      holdReason: "quiet",
    }, {
      id: 5,
      status: "failed",
      notBefore: null,
      createdAt: new Date("2026-01-10T07:10:00.000Z"),
      text: "Блок",
      dayNumber: 1,
      kind: "day_open",
      errorText: "Telegram 403: бот заблоковано",
      who: "Ігор",
    }],
    jobs: [{
      id: 8,
      userId: 3,
      dayNumber: 1,
      kind: "rank",
      channel: "telegram",
      body: "Місце",
      sendAt: new Date("2026-01-11T08:00:00.000Z"),
      status: "cancelled",
      errorText: SKIP_REASON_TEXT.no_telegram,
    }],
  });
  const flat = days.flatMap((day) => day.items);
  const moved = flat.find((item) => item.key === "1:day_open:telegram");
  assert.equal(moved?.status, "postponed");
  assert.equal(moved?.effectiveAt, sendAt.toISOString());
  assert.equal(moved?.editable, true);
  const quiet = flat.find((item) => item.key === "outbox:4");
  assert.equal(quiet?.status, "quiet");
  assert.equal(quiet?.effectiveAt, "2026-01-10T20:00:00.000Z");
  assert.equal(quiet?.editable, true);
  const blocked = flat.find((item) => item.key === "outbox:5");
  assert.equal(blocked?.status, "failed");
  assert.equal(blocked?.reason, "Telegram 403: бот заблоковано");
  assert.equal(blocked?.failures[0]?.who, "Ігор");
  const partial = flat.find((item) => item.key === "1:reminder:email");
  assert.equal(partial?.status, "partial");
  assert.equal(partial?.sentCount, 1);
  assert.equal(partial?.failedCount, 1);
  assert.equal(partial?.sentAt, sentAt.toISOString());
  assert.equal(partial?.editable, false);
  assert.equal(partial?.failures[0]?.reason, "Помилка Brevo");
  const missingBot = flat.find((item) => item.key === "job:8");
  assert.equal(missingBot?.status, "skipped");
  assert.equal(missingBot?.reason, SKIP_REASON_TEXT.no_telegram);
});

test("opt-out and a missing Telegram link skip the slot; an unfinished kind stays planned", () => {
  const opted = [person({ paused: true })];
  assert.equal(scheduleSkipReason(opted, 1, "day_open", "email", 2), "opt_out");
  const unlinked = [person({ telegramChatId: null, notifyBot: true })];
  assert.equal(scheduleSkipReason(unlinked, 1, "reminder", "telegram", 2), "no_telegram");
  assert.equal(scheduleSkipReason([person({ completedDayNumbers: [] })], 2, "tomorrow", "email", 2), null);
  const days = buildMessageTimeline({
    schedule,
    linkBase: "https://nmt.in.ua/marathon/vesna",
    people: opted,
    ledger: [],
    overrides: [],
    outbox: [],
    jobs: [],
  });
  const open = days.flatMap((day) => day.items).find((item) => item.kind === "day_open" && item.channel === "email");
  assert.equal(open?.status, "skipped");
  assert.equal(open?.reason, SKIP_REASON_TEXT.opt_out);
  const tomorrow = buildMessageTimeline({
    schedule,
    linkBase: "https://nmt.in.ua/marathon/vesna",
    people: [person()],
    ledger: [],
    overrides: [],
    outbox: [],
    jobs: [],
  }).flatMap((day) => day.items).find((item) => item.kind === "tomorrow" && item.channel === "email");
  assert.equal(tomorrow?.audience, 0);
  assert.equal(tomorrow?.status, "planned");
});

test("deliveryErrorText keeps a short stored reason", () => {
  assert.equal(deliveryErrorText({ channel: "telegram", errorCode: 403 }), "Telegram 403: бот заблоковано");
  assert.equal(deliveryErrorText({ channel: "telegram", errorCode: 400 }), "Telegram 400");
  assert.equal(deliveryErrorText({ channel: "telegram", gaveUp: true }), "Час очікування Telegram вичерпано");
  assert.equal(deliveryErrorText({ channel: "telegram", invalidPayload: true }), "Некоректне повідомлення в черзі");
  assert.equal(deliveryErrorText({ channel: "email", mailError: "timeout" }), "Час очікування Brevo вичерпано");
  assert.equal(deliveryErrorText({ channel: "email", mailError: "brevo_error" }), "Помилка Brevo");
  assert.equal(deliveryErrorText({ channel: "email", mailError: "Brevo request timed out" }), "Час очікування Brevo вичерпано");
});
