import assert from "node:assert/strict";
import test from "node:test";
import { recommendFromSessionMistakes } from "./recommendFromSessionMistakes";
import type { SessionMistakeItem } from "@/modules/testing/getSessionMistakeReview";

const t = (key: string, values?: Record<string, string | number>) =>
  `${key}:${JSON.stringify(values ?? {})}`;

function mistake(
  partial: Partial<SessionMistakeItem> & Pick<SessionMistakeItem, "name">,
): SessionMistakeItem {
  return {
    taskText: "x",
    comment: "",
    themeId: null,
    themeCode: null,
    themeName: null,
    ...partial,
  };
}

test("recommendFromSessionMistakes: empty when no themes", () => {
  assert.deepEqual(
    recommendFromSessionMistakes(
      [mistake({ name: "1", themeId: null })],
      t,
    ),
    [],
  );
});

test("recommendFromSessionMistakes: materials + topic-test per theme", () => {
  const actions = recommendFromSessionMistakes(
    [
      mistake({
        name: "a",
        themeId: 3,
        themeCode: "GEO-07-ELEM-PLAN",
        themeName: "Планіметрія",
      }),
      mistake({
        name: "b",
        themeId: 3,
        themeCode: "GEO-07-ELEM-PLAN",
        themeName: "Планіметрія",
      }),
      mistake({
        name: "c",
        themeId: 7,
        themeCode: "ALG-07-EQ",
        themeName: "Рівняння",
      }),
    ],
    t,
  );

  assert.equal(actions.length, 4);
  assert.equal(actions[0]?.type, "materials");
  assert.equal(actions[0]?.href, "/materials/textbook?topic=GEO-07-ELEM-PLAN");
  assert.equal(actions[1]?.type, "topic-test");
  assert.equal(actions[1]?.href, "/?theme=3");
  assert.equal(actions[2]?.themeId, 7);
  assert.equal(actions[2]?.href, "/materials/textbook?topic=ALG-07-EQ");
  assert.equal(actions[3]?.href, "/?theme=7");
});

test("recommendFromSessionMistakes: caps at 3 themes", () => {
  const mistakes = [1, 2, 3, 4].flatMap((id) => [
    mistake({
      name: `t${id}`,
      themeId: id,
      themeCode: `CODE-${id}`,
      themeName: `Theme ${id}`,
    }),
  ]);
  const actions = recommendFromSessionMistakes(mistakes, t);
  assert.equal(actions.length, 6);
  const themeIds = new Set(actions.map((a) => a.themeId));
  assert.equal(themeIds.size, 3);
});
