import assert from "node:assert/strict";
import test from "node:test";

import { presentBellNotifications } from "./bell";
import type { NotificationSnapshot } from "./logic";

function note(
  partial: Partial<NotificationSnapshot> & Pick<NotificationSnapshot, "id" | "kind">,
): NotificationSnapshot {
  return {
    userId: 4,
    title: partial.kind,
    body: "текст",
    link: null,
    createdAt: "2026-11-04T12:00:00.000Z",
    readAt: null,
    ...partial,
  };
}

test("a student does not see another person's feedback", () => {
  const presented = presentBellNotifications({
    role: "student",
    joinedSlugs: new Set(),
    declinedSlugs: new Set(),
    items: [
      note({
        id: 3,
        kind: "admin.feedback",
        body: "YEVHENII KROCHAK (@zhnekakrochak79): оцінка 10/10",
      }),
      note({ id: 2, kind: "marathon.day_open", link: "/marathon/math/day/1" }),
    ],
  });
  assert.deepEqual(presented.visible.map((item) => item.id), [2]);
  assert.deepEqual(presented.dismissIds, [3]);
});

test("an admin and a developer still see feedback", () => {
  const presented = presentBellNotifications({
    role: "admin",
    joinedSlugs: new Set(),
    declinedSlugs: new Set(),
    items: [note({ id: 3, kind: "admin.feedback" })],
  });
  assert.equal(presented.visible.length, 1);
  assert.deepEqual(presented.dismissIds, []);
  const asDev = presentBellNotifications({
    role: "dev",
    joinedSlugs: new Set(),
    declinedSlugs: new Set(),
    items: [note({ id: 3, kind: "admin.feedback" })],
  });
  assert.equal(asDev.visible.length, 1);
});

test("an invitation already joined or declined leaves the bell", () => {
  const presented = presentBellNotifications({
    role: "student",
    joinedSlugs: new Set(["math"]),
    declinedSlugs: new Set(["geo"]),
    items: [
      note({ id: 8, kind: "marathon.invite", link: "/marathon/math" }),
      note({ id: 7, kind: "marathon.invite", link: "/marathon/geo" }),
      note({ id: 6, kind: "marathon.invite", link: "/marathon/open" }),
    ],
  });
  assert.deepEqual(presented.visible.map((item) => item.id), [6]);
  assert.deepEqual(presented.dismissIds, [8, 7]);
});

test("topic reminders collapse to the newest unread row", () => {
  const presented = presentBellNotifications({
    role: "student",
    joinedSlugs: new Set(),
    declinedSlugs: new Set(),
    items: [
      note({ id: 12, kind: "topic.reminder", link: "/session/12", body: "Завершіть тест" }),
      note({ id: 11, kind: "topic.reminder", link: "/session/11", body: "Завершіть тест" }),
      note({ id: 10, kind: "topic.reminder", link: "/session/10", readAt: "2026-11-01T00:00:00.000Z" }),
    ],
  });
  assert.deepEqual(presented.visible.map((item) => item.id), [12]);
  assert.deepEqual(presented.dismissIds, [11]);
});
