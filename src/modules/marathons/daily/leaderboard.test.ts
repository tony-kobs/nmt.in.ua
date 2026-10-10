import assert from "node:assert/strict";
import test from "node:test";
import { COPY_DEFAULTS, renderCopy } from "./copy";
import {
  applyRankSnapshot,
  buildRankVars,
  formatBoardMessage,
  publicLeaderName,
  rankCopyKey,
  rankNoticeText,
  rankParticipants,
  rankTone,
  type RankInput,
} from "./leaderboard";

function row(partial: Partial<RankInput> & Pick<RankInput, "userId" | "points">): RankInput {
  return {
    displayName: `Учень ${partial.userId}`,
    lastCompletedAt: 1_000,
    streak: 0,
    joinedAt: partial.userId,
    ...partial,
  };
}

test("ranking sums points and breaks ties by earlier completion, then join, then id", () => {
  const ranked = rankParticipants([
    row({ userId: 3, points: 4, lastCompletedAt: 500, joinedAt: 9 }),
    row({ userId: 1, points: 4, lastCompletedAt: 200, joinedAt: 9 }),
    row({ userId: 2, points: 9, lastCompletedAt: 800, joinedAt: 1 }),
    row({ userId: 4, points: 0, lastCompletedAt: null, joinedAt: 50 }),
    row({ userId: 5, points: 0, lastCompletedAt: null, joinedAt: 10 }),
    row({ userId: 6, points: 0, lastCompletedAt: null, joinedAt: 10 }),
  ]);
  assert.deepEqual(ranked.map((item) => item.userId), [2, 1, 3, 5, 6, 4]);
  assert.deepEqual(ranked.map((item) => item.place), [1, 2, 3, 4, 5, 6]);
});

test("snapshot keeps the previous place and leaves a first appearance empty", () => {
  const ranked = rankParticipants([
    row({ userId: 1, points: 3, lastCompletedAt: 10 }),
    row({ userId: 2, points: 1, lastCompletedAt: 20 }),
  ]);
  const next = applyRankSnapshot(new Map([[2, 1]]), ranked);
  assert.equal(next[0]?.prevPlace, null);
  assert.equal(next[0]?.place, 1);
  assert.equal(next[1]?.prevPlace, 1);
  assert.equal(next[1]?.place, 2);
});

test("tone picks first, up, down, same and nudge", () => {
  assert.equal(rankTone({ completed: false, place: 4, prevPlace: 2 }), "nudge");
  assert.equal(rankTone({ completed: true, place: 1, prevPlace: 3 }), "first");
  assert.equal(rankTone({ completed: true, place: 1, prevPlace: 1 }), "first");
  assert.equal(rankTone({ completed: true, place: 2, prevPlace: 5 }), "up");
  assert.equal(rankTone({ completed: true, place: 5, prevPlace: 2 }), "down");
  assert.equal(rankTone({ completed: true, place: 4, prevPlace: 4 }), "same");
  assert.equal(rankTone({ completed: true, place: 4, prevPlace: null }), "same");
});

test("rank messages use the tone template and the new place, not the email", () => {
  const up = rankNoticeText(null, {
    name: "Марія Коваленко",
    place: 2,
    prevPlace: 5,
    points: 7,
    day: 3,
  });
  assert.match(up, /Молодець, Марія К\./);
  assert.match(up, /Піднявся на 2 місце/);
  assert.match(up, /було 5/);
  assert.match(up, /7 балів/);
  assert.equal(up.includes("@"), false);

  const down = renderCopy(COPY_DEFAULTS[rankCopyKey("down")], buildRankVars({
    name: "Олег",
    place: 4,
    prevPlace: 2,
    points: 3,
    day: 1,
  }));
  assert.match(down, /опустився на 4 місце/);
  assert.match(down, /було 2/);

  const first = rankNoticeText(null, {
    name: "Іра",
    place: 1,
    prevPlace: null,
    points: 2,
    day: 1,
  });
  assert.match(first, /першому місці/);

  const same = rankNoticeText(null, {
    name: "Іра",
    place: 3,
    prevPlace: 3,
    points: 2,
    day: 2,
  });
  assert.match(same, /те саме — 3/);

  const nudge = renderCopy(COPY_DEFAULTS.rank_nudge, buildRankVars({
    name: "Олег",
    place: 6,
    prevPlace: 6,
    points: 1,
    day: 2,
    link: "https://nmt.in.ua/marathon/math-5/day/2",
  }));
  assert.match(nudge, /Може покращимо своє місце/);
  assert.match(nudge, /6 місці/);
  assert.match(nudge, /https:\/\/nmt\.in\.ua\/marathon\/math-5\/day\/2/);
});

test("public names hide the address and keep a first name with an initial", () => {
  assert.equal(publicLeaderName("Марія Коваленко"), "Марія К.");
  assert.equal(publicLeaderName("Олег"), "Олег");
  assert.equal(publicLeaderName("maria.k@example.com"), "maria.k");
  assert.equal(publicLeaderName("  "), "Учасник");
  assert.equal(publicLeaderName(null), "Учасник");
  const board = formatBoardMessage({
    title: "Таблиця марафону",
    rows: [{ place: 1, name: publicLeaderName("a@b.c Extra"), points: 4, streak: 2 }],
    self: { place: 8, name: publicLeaderName("b@c.d"), points: 0, streak: 0 },
    selfOutside: true,
  });
  assert.equal(board.includes("@"), false);
  assert.match(board, /1\. a — 4 · серія 2/);
  assert.match(board, /8\. b — 0/);
});
