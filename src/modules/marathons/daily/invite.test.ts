import assert from "node:assert/strict";
import test from "node:test";

import { selectHomeMarathonCards } from "./homeCard";
import {
  normalizeInviteAudience,
  selectInviteRecipients,
  selectMarathonInvites,
  type InviteCandidate,
} from "./invite";

const marathons = [
  { id: 1, slug: "math-5", title: "П'ять днів", status: "active" },
  { id: 2, slug: "geo", title: "Геометрія", status: "active" },
  { id: 3, slug: "old", title: "Архів", status: "finished" },
];

const person = (patch: Partial<InviteCandidate> & Pick<InviteCandidate, "userId" | "role">): InviteCandidate => ({
  email: "a@example.com",
  telegramChatId: "100",
  declined: false,
  marathonEmail: true,
  marathonTelegram: true,
  ...patch,
});

test("a recorded invite stays until the person joins or declines", () => {
  const open = selectMarathonInvites({
    marathons,
    joinedIds: new Set(),
    declinedIds: new Set(),
    invitedIds: new Set([1, 2]),
  });
  assert.deepEqual(open.map((item) => item.slug), ["math-5", "geo"]);
  const answered = selectMarathonInvites({
    marathons,
    joinedIds: new Set([1]),
    declinedIds: new Set([2]),
    invitedIds: new Set([1, 2, 3]),
  });
  assert.deepEqual(answered, []);
});

test("the banner is only for people the activation recorded", () => {
  assert.deepEqual(
    selectMarathonInvites({
      marathons,
      joinedIds: new Set(),
      declinedIds: new Set(),
      invitedIds: new Set(),
    }),
    [],
  );
  assert.deepEqual(
    selectMarathonInvites({
      marathons,
      joinedIds: new Set(),
      declinedIds: new Set([1]),
      invitedIds: new Set([1, 2]),
    }).map((item) => item.slug),
    ["geo"],
  );
});

test("invite audience skips declines, teachers when limited to students, and a closed marathon category", () => {
  assert.equal(normalizeInviteAudience(undefined), "none");
  assert.equal(normalizeInviteAudience("all"), "all");
  const people = [
    person({ userId: 1, role: "student" }),
    person({ userId: 2, role: "teacher" }),
    person({ userId: 3, role: "admin" }),
    person({ userId: 4, role: "student", declined: true }),
    person({ userId: 5, role: "student", marathonEmail: false, marathonTelegram: false }),
    person({ userId: 6, role: "student", marathonEmail: false, marathonTelegram: true, email: null }),
  ];
  assert.deepEqual(selectInviteRecipients("none", people).map((item) => item.userId), []);
  assert.deepEqual(
    selectInviteRecipients("students", people).map((item) => item.userId),
    [1, 6],
  );
  assert.deepEqual(
    selectInviteRecipients("all", people).map((item) => item.userId),
    [1, 2, 3, 6],
  );
});

test("the home card stays visible without an invitation", () => {
  const cards = selectHomeMarathonCards({
    marathons: marathons.map((item) => ({
      slug: item.slug,
      title: item.title,
      description: "",
      status: item.status,
    })),
    joinedSlugs: new Set(),
    declinedSlugs: new Set(),
  });
  assert.deepEqual(cards.map((card) => card.slug), ["math-5", "geo"]);
});
