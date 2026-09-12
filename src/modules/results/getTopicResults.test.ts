import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { reduceLatestSelfScores } from "@/modules/self-score/types";

import {
  buildTopicResultRows,
  formatPercent,
  formatSpeed,
  getScoreLevel,
} from "./types";
import { attachSelfScores, getTopicResults } from "./getTopicResults";

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

test("attachSelfScores prefers the latest pre_topic score for the theme", () => {
  const rows = buildTopicResultRows([{ id: 1, name: "Тема", ord: 0 }], []);
  const latest = reduceLatestSelfScores([
    { theme_id: 1, score: 9, source: "pre_topic" },
    { theme_id: null, score: 3, source: "diagnostic_overall" },
  ]);
  const withScores = attachSelfScores(rows, latest);
  assert.equal(withScores[0]?.selfScore, 9);
});

test("attachSelfScores falls back to the latest diagnostic_overall score", () => {
  const rows = buildTopicResultRows([{ id: 1, name: "Тема", ord: 0 }], []);
  const latest = reduceLatestSelfScores([
    { theme_id: null, score: 4, source: "diagnostic_overall" },
  ]);
  const withScores = attachSelfScores(rows, latest);
  assert.equal(withScores[0]?.selfScore, 4);
});

test("attachSelfScores leaves selfScore null when neither exists", () => {
  const rows = buildTopicResultRows([{ id: 1, name: "Тема", ord: 0 }], []);
  const withScores = attachSelfScores(rows, reduceLatestSelfScores([]));
  assert.equal(withScores[0]?.selfScore, null);
});

test("getTopicResults composes theme results with the self-score fallback", async () => {
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>(sql: string) => {
      if (sql.includes("FROM themes")) {
        return [{ id: 1, name: "Тема", ord: 0 }] as unknown as T[];
      }
      if (sql.includes("FROM task_sessions")) {
        return [] as unknown as T[];
      }
      if (sql.includes("FROM user_self_scores")) {
        return [
          { theme_id: 1, score: 6, source: "pre_topic" },
        ] as unknown as T[];
      }
      return [] as T[];
    },
    execute: async () => ({ insertId: 0, affectedRows: 0 }),
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };

  const rows = await getTopicResults(1, { getConnection: async () => connection });
  assert.equal(rows[0]?.selfScore, 6);
});

test("getTopicResults excludes expired unfinished attempts before the per-theme window, via the injected clock", async () => {
  const now = 1_700_000_000;
  let sessionsSql = "";
  let sessionsParams: unknown[] = [];

  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>(sql: string, params: unknown[] = []) => {
      if (sql.includes("FROM themes")) {
        return [{ id: 1, name: "Тема", ord: 0 }] as unknown as T[];
      }
      if (sql.includes("FROM task_sessions")) {
        sessionsSql = sql;
        sessionsParams = params;
        return [] as unknown as T[];
      }
      return [] as T[];
    },
    execute: async () => ({ insertId: 0, affectedRows: 0 }),
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };

  await getTopicResults(1, {
    getConnection: async () => connection,
    nowSec: () => now,
  });

  assert.match(sessionsSql, /session_status = 1 OR expire_time > \?/);
  assert.deepEqual(sessionsParams, [1, now]);
});
