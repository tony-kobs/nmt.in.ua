import assert from "node:assert/strict";
import test from "node:test";
import {
  deliverNotifications,
  fallbackEmailAfterTelegram,
  isDefinitiveTelegramFailure,
  planFollowUps,
  planNotifications,
  planNudges,
  unsubscribeToken,
  verifyUnsubscribeToken,
  type NotifyIntent,
} from "./notifications";

const person = {
  userId: 7,
  email: "a@example.com",
  telegramChatId: "100",
  notifyEmail: true,
  notifyBot: true,
  completedDayNumbers: [] as number[],
};

const marathon = {
  marathonId: 3,
  startDate: "2026-01-10",
  unlockHour: "09:00",
  daysCount: 5,
  people: [person],
};

test("day-open is planned inside the window and not as a late-joiner backlog", () => {
  const open = planNotifications({
    ...marathon,
    now: new Date("2026-01-10T07:30:00.000Z"),
  });
  assert.equal(open.filter((item) => item.kind === "day_open").length, 2);
  assert.deepEqual(
    open.filter((item) => item.kind === "day_open").map((item) => item.channel).sort(),
    ["email", "telegram"],
  );
  assert.equal(open.some((item) => item.kind === "reminder"), false);

  const late = planNotifications({
    ...marathon,
    now: new Date("2026-01-12T07:30:00.000Z"),
  });
  assert.equal(
    late.some((item) => item.kind === "day_open" && item.dayNumber === 1),
    false,
  );
  assert.equal(
    late.some((item) => item.kind === "day_open" && item.dayNumber === 3),
    true,
  );
});

test("evening reminder fires after 19:00 Kyiv only for today's unfinished day", () => {
  const before = planNotifications({
    ...marathon,
    now: new Date("2026-01-10T16:59:00.000Z"),
  });
  assert.equal(before.some((item) => item.kind === "reminder"), false);

  const evening = planNotifications({
    ...marathon,
    now: new Date("2026-01-10T17:00:00.000Z"),
    people: [{ ...person, completedDayNumbers: [1] }],
  });
  assert.equal(evening.some((item) => item.kind === "reminder"), false);

  const due = planNotifications({
    ...marathon,
    now: new Date("2026-01-10T17:00:00.000Z"),
    people: [{ ...person, notifyBot: false, telegramChatId: null }],
  });
  assert.deepEqual(
    due.map((item) => `${item.kind}:${item.channel}`),
    ["reminder:email"],
  );
});

test("day-open, reminder and nudge never share one moment for the same day", () => {
  const insideOpen = planNotifications({
    ...marathon,
    unlockHour: "18:00",
    reminderHour: "18:30",
    now: new Date("2026-01-10T16:40:00.000Z"),
  });
  assert.deepEqual(
    [...new Set(insideOpen.map((item) => `${item.dayNumber}:${item.kind}`))],
    ["1:day_open"],
  );

  const afterOpen = planNotifications({
    ...marathon,
    unlockHour: "18:00",
    reminderHour: "18:30",
    now: new Date("2026-01-10T17:10:00.000Z"),
  });
  assert.deepEqual(
    [...new Set(afterOpen.map((item) => `${item.dayNumber}:${item.kind}`))],
    ["1:reminder"],
  );

  const nextMorning = new Date("2026-01-11T08:00:00.000Z");
  const opens = planNotifications({ ...marathon, now: nextMorning });
  assert.equal(opens.some((item) => item.dayNumber === 1), false);
  assert.equal(opens.some((item) => item.kind === "day_open" && item.dayNumber === 2), false);
  const nudges = planNudges({ ...marathon, now: nextMorning });
  assert.deepEqual(
    [...new Set(nudges.map((item) => `${item.dayNumber}:${item.kind}`))],
    ["1:nudge"],
  );
});

test("delivery is idempotent: a claimed send is not repeated, a failure can retry", async () => {
  const seen = new Set<string>();
  const key = (intent: NotifyIntent) =>
    `${intent.userId}:${intent.dayNumber}:${intent.kind}:${intent.channel}`;
  const intent: NotifyIntent = {
    marathonId: 1,
    userId: 7,
    dayNumber: 1,
    kind: "day_open",
    channel: "email",
  };
  let attempts = 0;
  const claim = async (item: NotifyIntent) => {
    const id = key(item);
    if (seen.has(id)) return "duplicate" as const;
    seen.add(id);
    return "claimed" as const;
  };
  const release = async (item: NotifyIntent) => {
    seen.delete(key(item));
  };
  const send = async () => {
    attempts += 1;
    return attempts > 1;
  };
  const first = await deliverNotifications([intent], { claim, release, send });
  assert.deepEqual(first, { sent: 0, skipped: 0, failed: 1 });
  const second = await deliverNotifications([intent], { claim, release, send });
  assert.deepEqual(second, { sent: 1, skipped: 0, failed: 0 });
  const third = await deliverNotifications([intent], { claim, release, send });
  assert.deepEqual(third, { sent: 0, skipped: 1, failed: 0 });
  assert.equal(attempts, 2);
});

test("a deferred send releases the claim and is not a failure", async () => {
  const seen = new Set<string>();
  const intent: NotifyIntent = {
    marathonId: 1, userId: 7, dayNumber: 1, kind: "reminder", channel: "telegram",
  };
  let released = 0;
  let confirmed = 0;
  const first = await deliverNotifications([intent], {
    claim: async () => {
      seen.add("1");
      return "claimed";
    },
    release: async () => { released += 1; seen.delete("1"); },
    confirm: async () => { confirmed += 1; },
    send: async () => "defer",
  });
  assert.deepEqual(first, { sent: 0, skipped: 1, failed: 0 });
  assert.equal(released, 1);
  assert.equal(confirmed, 0);
  const second = await deliverNotifications([intent], {
    claim: async () => (seen.has("1") ? "duplicate" : "claimed"),
    release: async () => {},
    send: async () => true,
  });
  assert.deepEqual(second, { sent: 1, skipped: 0, failed: 0 });
});

test("a missed day is nudged once, only after the next unlock and inside 10:00–21:00 Kyiv", async () => {
  const quiet = planNudges({
    ...marathon,
    now: new Date("2026-01-11T07:30:00.000Z"),
  });
  assert.equal(quiet.length, 0);

  const tooEarly = planNudges({
    ...marathon,
    now: new Date("2026-01-10T17:00:00.000Z"),
  });
  assert.equal(tooEarly.some((item) => item.kind === "nudge"), false);

  const due = planNudges({
    ...marathon,
    now: new Date("2026-01-11T08:00:00.000Z"),
  });
  assert.deepEqual(
    due.map((item) => `${item.kind}:${item.dayNumber}:${item.channel}`).sort(),
    ["nudge:1:email", "nudge:1:telegram"],
  );

  const done = planNudges({
    ...marathon,
    now: new Date("2026-01-11T08:00:00.000Z"),
    people: [{ ...person, completedDayNumbers: [1] }],
  });
  assert.equal(done.length, 0);

  const night = planNudges({
    ...marathon,
    now: new Date("2026-01-11T19:00:00.000Z"),
  });
  assert.equal(night.length, 0);

  const seen = new Set<string>();
  const claim = async (item: NotifyIntent) => {
    const id = `${item.dayNumber}:${item.kind}:${item.channel}`;
    if (seen.has(id)) return "duplicate" as const;
    seen.add(id);
    return "claimed" as const;
  };
  const first = await deliverNotifications(due, {
    claim,
    release: async () => undefined,
    send: async () => true,
  });
  const second = await deliverNotifications(due, {
    claim,
    release: async () => undefined,
    send: async () => true,
  });
  assert.deepEqual(first, { sent: 2, skipped: 0, failed: 0 });
  assert.deepEqual(second, { sent: 0, skipped: 2, failed: 0 });
});

test("tomorrow announcement is claimed once", async () => {
  const intents = planFollowUps({
    marathonId: 3,
    daysCount: 3,
    people: [{
      ...person,
      notifyEmail: false,
      completedDayNumbers: [1],
    }],
  });
  assert.deepEqual(intents.map((item) => `${item.kind}:${item.dayNumber}:${item.channel}`), [
    "tomorrow:2:telegram",
  ]);
  const seen = new Set<string>();
  const claim = async (item: NotifyIntent) => {
    const id = `${item.dayNumber}:${item.kind}:${item.channel}`;
    if (seen.has(id)) return "duplicate" as const;
    seen.add(id);
    return "claimed" as const;
  };
  const result = await deliverNotifications([...intents, ...intents], {
    claim,
    release: async () => undefined,
    send: async () => true,
  });
  assert.deepEqual(result, { sent: 1, skipped: 1, failed: 0 });
});

test("unsubscribe token matches only the same participant and secret", () => {
  assert.equal(verifyUnsubscribeToken(4, 9, "nope", "secret"), false);
  const token = unsubscribeToken(4, 9, "secret");
  assert.equal(verifyUnsubscribeToken(4, 9, token, "secret"), true);
  assert.equal(verifyUnsubscribeToken(4, 8, token, "secret"), false);
  assert.equal(verifyUnsubscribeToken(4, 9, token, "other"), false);
});

test("a day with no content is not announced, reminded or nudged", () => {
  const empty = planNotifications({
    ...marathon,
    now: new Date("2026-01-10T07:30:00.000Z"),
    dayNumbers: [],
  });
  assert.deepEqual(empty, []);
  const otherDay = planNotifications({
    ...marathon,
    now: new Date("2026-01-12T07:30:00.000Z"),
    dayNumbers: [1],
  });
  assert.equal(otherDay.some((item) => item.dayNumber === 3), false);
  const nudges = planNudges({
    ...marathon,
    now: new Date("2026-01-11T08:00:00.000Z"),
    dayNumbers: [],
  });
  assert.deepEqual(nudges, []);
});

test("email and telegram are both planned when both toggles are on", () => {
  const both = planNotifications({
    ...marathon,
    now: new Date("2026-01-10T07:30:00.000Z"),
    people: [person],
  });
  assert.ok(both.some((item) => item.channel === "email"));
  assert.ok(both.some((item) => item.channel === "telegram"));

  const emailOff = planNotifications({
    ...marathon,
    now: new Date("2026-01-10T07:30:00.000Z"),
    people: [{ ...person, notifyEmail: false }],
  });
  assert.ok(emailOff.length > 0);
  assert.ok(emailOff.every((item) => item.channel === "telegram"));

  const unlinked = planNotifications({
    ...marathon,
    now: new Date("2026-01-10T07:30:00.000Z"),
    people: [{ ...person, telegramChatId: null, notifyBot: true }],
  });
  assert.ok(unlinked.length > 0);
  assert.ok(unlinked.every((item) => item.channel === "email"));
});

test("email is only the fallback after a definitive telegram failure", async () => {
  assert.equal(isDefinitiveTelegramFailure({ status: "rejected", errorCode: 403 }), true);
  assert.equal(isDefinitiveTelegramFailure({ status: "rejected", errorCode: 400 }), true);
  assert.equal(
    isDefinitiveTelegramFailure({ status: "rejected", errorCode: 400, retryAfter: 2 }),
    false,
  );
  assert.equal(isDefinitiveTelegramFailure({ status: "rejected", errorCode: 401 }), false);
  assert.equal(isDefinitiveTelegramFailure({ status: "rejected", errorCode: 429, retryAfter: 3 }), false);
  assert.equal(isDefinitiveTelegramFailure({ status: "unknown" }), false);

  const seen = new Set<string>();
  const sent: string[] = [];
  const intent: NotifyIntent = {
    marathonId: 1,
    userId: 7,
    dayNumber: 1,
    kind: "day_open",
    channel: "telegram",
  };
  const claim = async (item: NotifyIntent) => {
    if (seen.has(item.channel)) return "duplicate" as const;
    seen.add(item.channel);
    return "claimed" as const;
  };
  const release = async (item: NotifyIntent) => {
    seen.delete(item.channel);
  };
  const retry = await fallbackEmailAfterTelegram({
    intent,
    email: "a@example.com",
    attempt: "retry",
    claim,
    release,
    sendEmail: async () => {
      sent.push("email");
      return true;
    },
  });
  assert.equal(retry, false);
  assert.deepEqual([...sent], []);

  const letterFailed = await fallbackEmailAfterTelegram({
    intent,
    email: "a@example.com",
    attempt: "definitive",
    claim,
    release,
    sendEmail: async () => false,
  });
  assert.equal(letterFailed, false);
  assert.equal(seen.has("email"), false);

  const letter = await fallbackEmailAfterTelegram({
    intent,
    email: "a@example.com",
    attempt: "definitive",
    claim,
    release,
    confirm: async () => undefined,
    sendEmail: async () => {
      sent.push("email");
      return true;
    },
  });
  const again = await fallbackEmailAfterTelegram({
    intent,
    email: "a@example.com",
    attempt: "definitive",
    claim,
    release,
    sendEmail: async () => {
      sent.push("again");
      return true;
    },
  });
  assert.equal(letter, true);
  assert.equal(again, true);
  assert.deepEqual(sent, ["email"]);
});

test("a claim is confirmed only after a successful send", async () => {
  const intent: NotifyIntent = { marathonId: 1, userId: 7, dayNumber: 5, kind: "day_open", channel: "telegram" };
  const confirmed: NotifyIntent[] = [];
  const released: NotifyIntent[] = [];
  const deps = {
    claim: async () => "claimed" as const,
    release: async (item: NotifyIntent) => { released.push(item); },
    confirm: async (item: NotifyIntent) => { confirmed.push(item); },
  };
  await deliverNotifications([intent], { ...deps, send: async () => false });
  assert.equal(confirmed.length, 0);
  assert.equal(released.length, 1);
  await deliverNotifications([intent], { ...deps, send: async () => true });
  assert.equal(confirmed.length, 1);
});
