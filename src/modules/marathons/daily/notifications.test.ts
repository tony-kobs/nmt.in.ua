import assert from "node:assert/strict";
import test from "node:test";
import {
  deliverNotifications,
  planFollowUps,
  planNotifications,
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
    due.map((item) => item.channel),
    ["email", "email"],
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
