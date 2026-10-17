import assert from "node:assert/strict";
import test from "node:test";

import { selectStudentMarathonShelf } from "./shelf";

const active = {
  slug: "math-5",
  title: "Дроби",
  description: "П'ять днів",
  status: "active" as const,
  daysCount: 5,
  startDate: "2026-10-01",
};

test("the shelf shows every active marathon and joined finished ones", () => {
  const cards = selectStudentMarathonShelf({
    marathons: [
      active,
      {
        slug: "old",
        title: "Минулий",
        description: "",
        status: "finished",
        daysCount: 3,
        startDate: "2026-09-01",
      },
      {
        slug: "other-old",
        title: "Чужий",
        description: "",
        status: "finished",
        daysCount: 3,
        startDate: "2026-08-01",
      },
      {
        slug: "now",
        title: "Зараз",
        description: "Коротко",
        status: "active",
        daysCount: 4,
        startDate: "2026-10-10",
      },
    ],
    joinedSlugs: new Set(["math-5", "old"]),
  });
  assert.deepEqual(
    cards.map((card) => card.slug),
    ["now", "math-5", "old"],
  );
  assert.equal(cards[0]?.joined, false);
  assert.equal(cards[0]?.href, "");
  assert.equal(cards[1]?.href, "/marathon/math-5/map");
  assert.equal(cards[2]?.joined, true);
});
