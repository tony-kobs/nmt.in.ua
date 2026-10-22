import assert from "node:assert/strict";
import test from "node:test";

import { selectFeaturedHomeMarathon, selectHomeMarathonCards } from "./homeCard";

const marathons = [
  {
    slug: "math-5",
    title: "П'ять днів",
    description: "Короткий курс дробів.",
    status: "active",
  },
  {
    slug: "draft-one",
    title: "Чернетка",
    description: "Ще не видно.",
    status: "draft",
  },
  {
    slug: "geo",
    title: "Геометрія",
    description: "",
    status: "active",
  },
];

test("home cards show active marathons and hide a decline", () => {
  const cards = selectHomeMarathonCards({
    marathons,
    joinedSlugs: new Set(),
    declinedSlugs: new Set(["geo"]),
  });
  assert.deepEqual(cards, [
    {
      slug: "math-5",
      title: "П'ять днів",
      description: "Короткий курс дробів.",
      action: "join",
      href: "/marathon/math-5/join",
    },
  ]);
});

test("a joined marathon offers continue and a draft stays off the home page", () => {
  const cards = selectHomeMarathonCards({
    marathons,
    joinedSlugs: new Set(["math-5"]),
    declinedSlugs: new Set(["math-5"]),
  });
  const joined = cards.find((card) => card.slug === "math-5");
  assert.equal(joined?.action, "continue");
  assert.equal(joined?.href, "/marathon/math-5/map");
  const open = cards.find((card) => card.slug === "geo");
  assert.equal(open?.action, "join");
  assert.equal(cards.some((card) => card.slug === "draft-one"), false);
});

test("the home board features the marathon the viewer already joined", () => {
  const cards = selectHomeMarathonCards({
    marathons,
    joinedSlugs: new Set(["geo"]),
    declinedSlugs: new Set(),
  });
  const featured = selectFeaturedHomeMarathon(cards);
  assert.equal(featured?.slug, "geo");
  assert.equal(selectFeaturedHomeMarathon([]), null);
});
