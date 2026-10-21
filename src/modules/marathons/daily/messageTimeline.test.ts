import assert from "node:assert/strict";
import test from "node:test";
import {
  audienceFor,
  buildMessageTimeline,
  decideSlot,
  gateIntents,
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

test("an archived course keeps sent rows and cancels the rest", () => {
  const days = buildMessageTimeline({
    schedule,
    linkBase: "https://nmt.in.ua/marathon/vesna",
    people: [person()],
    ledger: [{ dayNumber: 1, kind: "day_open", channel: "telegram", sent: 1, pending: 0 }],
    overrides: [],
    outbox: [],
    jobs: [],
    hold: true,
  });
  const items = days.flatMap((day) => day.items);
  const sent = items.filter((item) => item.status === "sent");
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.editable, false);
  assert.ok(items.length > 1);
  assert.ok(items.filter((item) => item !== sent[0]).every((item) => item.status === "cancelled" && !item.editable));
});
