import assert from "node:assert/strict";
import test from "node:test";

import { selectMarathonInvites } from "./invite";

const marathons = [
  { id: 1, slug: "math-5", title: "П'ять днів", status: "active" },
  { id: 2, slug: "geo", title: "Геометрія", status: "active" },
  { id: 3, slug: "old", title: "Архів", status: "finished" },
];

test("a student is invited to active marathons they have not joined or declined", () => {
  const invites = selectMarathonInvites({
    role: "student",
    marathons,
    joinedIds: new Set([1]),
    declinedIds: new Set([2]),
  });
  assert.deepEqual(invites, []);
});

test("decline removes the invitation and other roles are not invited", () => {
  const open = selectMarathonInvites({
    role: "student",
    marathons,
    joinedIds: new Set(),
    declinedIds: new Set(),
  });
  assert.deepEqual(
    open.map((item) => item.slug),
    ["math-5", "geo"],
  );
  const declined = selectMarathonInvites({
    role: "student",
    marathons,
    joinedIds: new Set(),
    declinedIds: new Set([1]),
  });
  assert.deepEqual(
    declined.map((item) => item.slug),
    ["geo"],
  );
  assert.deepEqual(
    selectMarathonInvites({
      role: "teacher",
      marathons,
      joinedIds: new Set(),
      declinedIds: new Set(),
    }),
    [],
  );
  assert.deepEqual(
    selectMarathonInvites({
      role: "admin",
      marathons,
      joinedIds: new Set(),
      declinedIds: new Set(),
    }),
    [],
  );
});
