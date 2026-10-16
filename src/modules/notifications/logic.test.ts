import assert from "node:assert/strict";
import test from "node:test";

import {
  markNotificationsRead,
  shouldInsertNotification,
  unreadCount,
  type NotificationSnapshot,
} from "./logic";

const row = (patch: Partial<NotificationSnapshot>): NotificationSnapshot => ({
  id: 1,
  userId: 7,
  kind: "marathon.invite",
  title: "Запрошення",
  body: "Марафон уже активний.",
  link: "/marathon/math-5",
  createdAt: "2026-10-16T08:00:00.000Z",
  readAt: null,
  ...patch,
});

test("once skips a second notification with the same user, kind and link", () => {
  const existing = [row({})];
  assert.equal(
    shouldInsertNotification(existing, {
      userId: 7,
      kind: "marathon.invite",
      link: "/marathon/math-5",
      once: true,
    }),
    false,
  );
  assert.equal(
    shouldInsertNotification(existing, {
      userId: 7,
      kind: "marathon.day_open",
      link: "/marathon/math-5/day/1",
      once: true,
    }),
    true,
  );
  assert.equal(
    shouldInsertNotification(existing, {
      userId: 8,
      kind: "marathon.invite",
      link: "/marathon/math-5",
      once: true,
    }),
    true,
  );
  assert.equal(
    shouldInsertNotification(existing, {
      userId: 7,
      kind: "marathon.invite",
      link: "/marathon/math-5",
      once: false,
    }),
    true,
  );
});

test("unread count ignores rows that were opened", () => {
  assert.equal(
    unreadCount([
      row({ readAt: null }),
      row({ id: 2, readAt: "2026-10-16T09:00:00.000Z" }),
      row({ id: 3, readAt: null }),
    ]),
    2,
  );
});

test("mark read stamps one row or every unread row of that user", () => {
  const rows = [
    row({ id: 1 }),
    row({ id: 2, userId: 9 }),
    row({ id: 3, readAt: "2026-10-16T09:00:00.000Z" }),
  ];
  const one = markNotificationsRead(rows, { userId: 7, id: 1, now: "2026-10-16T10:00:00.000Z" });
  assert.equal(one[0]?.readAt, "2026-10-16T10:00:00.000Z");
  assert.equal(one[1]?.readAt, null);
  assert.equal(one[2]?.readAt, "2026-10-16T09:00:00.000Z");

  const all = markNotificationsRead(rows, { userId: 7, all: true, now: "2026-10-16T11:00:00.000Z" });
  assert.equal(all[0]?.readAt, "2026-10-16T11:00:00.000Z");
  assert.equal(all[1]?.readAt, null);
  assert.equal(all[2]?.readAt, "2026-10-16T09:00:00.000Z");
});
