import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTopicResultRows,
  formatPercent,
  formatSpeed,
  getScoreLevel,
} from "./types";

test("getScoreLevel maps percent bands", () => {
  assert.equal(getScoreLevel(null), "none");
  assert.equal(getScoreLevel(80), "high");
  assert.equal(getScoreLevel(70), "high");
  assert.equal(getScoreLevel(69), "medium");
  assert.equal(getScoreLevel(40), "medium");
  assert.equal(getScoreLevel(39), "low");
});

test("formatPercent and formatSpeed render Ukrainian placeholders", () => {
  assert.equal(formatPercent(null), "—");
  assert.equal(formatPercent(66.2), "66%");
  assert.equal(formatSpeed(null), "—");
  assert.equal(formatSpeed(5.64), "5,6");
});

test("buildTopicResultRows aggregates overall, last three, and speed", () => {
  const themes = [
    { id: 1, code: "MATH-05-ELEM-OPS", name: " Елементарні дії ", ord: 0 },
    { id: 2, code: "MATH-06-ARITH-OPS", name: "Арифметика", ord: 1 },
  ];

  const sessions = [
    { id: 10, theme_id: 1, tasks_number: 10, right_number: 8, time: 56 },
    { id: 9, theme_id: 1, tasks_number: 10, right_number: 6, time: 70 },
    { id: 8, theme_id: 1, tasks_number: 10, right_number: 7, time: 60 },
    { id: 7, theme_id: 1, tasks_number: 10, right_number: 5, time: 80 },
    { id: 3, theme_id: 2, tasks_number: 5, right_number: 2, time: 55 },
  ];

  const rows = buildTopicResultRows(themes, sessions);

  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.themeName, "Елементарні дії");
  assert.equal(rows[0]?.themeCode, "MATH-05-ELEM-OPS");
  assert.equal(rows[0]?.displayIndex, 1);
  assert.equal(rows[0]?.overallPercent, 65);
  assert.equal(rows[0]?.lastThreePercent, 70);
  assert.equal(rows[0]?.avgSecondsPerTask, 6.65);

  assert.equal(rows[1]?.overallPercent, 40);
  assert.equal(rows[1]?.lastThreePercent, 40);
  assert.equal(rows[1]?.avgSecondsPerTask, 11);
});

test("buildTopicResultRows keeps empty metrics for themes without sessions", () => {
  const rows = buildTopicResultRows(
    [{ id: 8, code: "ALG-07-EQ", name: "Рівняння", ord: 0 }],
    [],
  );

  assert.deepEqual(rows[0], {
    themeId: 8,
    themeCode: "ALG-07-EQ",
    themeName: "Рівняння",
    displayIndex: 1,
    overallPercent: null,
    lastThreePercent: null,
    avgSecondsPerTask: null,
  });
});
