import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import { SESSION_STATUS_COMPLETED } from "@/modules/sessions/types";

import { getStudentTopicStats } from "./getStudentTopicStats";
import { buildStudentTopicStats } from "./types";

type FakeConnection = SqlConnection & { released: boolean };

function fakeConnection(
  handleQuery: (sql: string, params?: unknown[]) => unknown[],
): FakeConnection {
  const connection: FakeConnection = {
    released: false,
    beginTransaction: async () => {},
    query: async <T,>(sql: string, params?: unknown[]) =>
      handleQuery(sql, params) as T[],
    execute: async () => ({ insertId: 0, affectedRows: 0 }),
    commit: async () => {},
    rollback: async () => {},
    release: () => {
      connection.released = true;
    },
  };
  return connection;
}

test("buildStudentTopicStats: two completed sessions -> overallPercent and lastPercent from newest session", () => {
  const themes = [{ id: 1, name: "Тема A", ord: 0 }];
  const sessions = [
    { id: 20, theme_id: 1, tasks_number: 10, right_number: 6, time: 60 },
    { id: 10, theme_id: 1, tasks_number: 10, right_number: 8, time: 50 },
  ];

  const stats = buildStudentTopicStats(themes, sessions);

  assert.equal(stats.hasCompletedSessions, true);
  assert.deepEqual(stats.topicScores, [
    { themeId: 1, themeName: "Тема A", overallPercent: 70, lastPercent: 60 },
  ]);
});

test("buildStudentTopicStats: newest session (by ordering) determines lastPercent regardless of value", () => {
  const themes = [{ id: 1, name: "Тема A", ord: 0 }];
  const sessions = [
    { id: 20, theme_id: 1, tasks_number: 10, right_number: 8, time: 60 },
    { id: 10, theme_id: 1, tasks_number: 10, right_number: 6, time: 50 },
  ];

  const stats = buildStudentTopicStats(themes, sessions);

  assert.equal(stats.topicScores[0]?.lastPercent, 80);
});

test("buildStudentTopicStats: topic with no sessions has null metrics", () => {
  const themes = [
    { id: 1, name: "Тема A", ord: 0 },
    { id: 2, name: "Тема B", ord: 1 },
  ];
  const sessions = [
    { id: 10, theme_id: 1, tasks_number: 10, right_number: 8, time: 50 },
  ];

  const stats = buildStudentTopicStats(themes, sessions);

  assert.deepEqual(stats.topicScores[1], {
    themeId: 2,
    themeName: "Тема B",
    overallPercent: null,
    lastPercent: null,
  });
});

test("buildStudentTopicStats: empty user keeps all themes with null metrics and hasCompletedSessions false", () => {
  const themes = [
    { id: 1, name: "Тема A", ord: 0 },
    { id: 2, name: "Тема B", ord: 1 },
  ];

  const stats = buildStudentTopicStats(themes, []);

  assert.equal(stats.hasCompletedSessions, false);
  assert.equal(stats.topicScores.length, 2);
  for (const score of stats.topicScores) {
    assert.equal(score.overallPercent, null);
    assert.equal(score.lastPercent, null);
  }
});

test("getStudentTopicStats: loads themes + completed sessions separately and releases", async () => {
  let sessionParams: unknown[] | undefined;
  const connection = fakeConnection((sql, params) => {
    if (sql.includes("FROM themes")) {
      return [
        { id: 1, name: "Тема A", ord: 0 },
        { id: 2, name: "Тема B", ord: 1 },
      ];
    }
    if (sql.includes("FROM task_sessions")) {
      sessionParams = params;
      return [
        {
          id: 10,
          theme_id: 1,
          tasks_number: 10,
          right_number: 8,
          time: 50,
        },
      ];
    }
    return [];
  });

  const stats = await getStudentTopicStats(1, {
    getConnection: async () => connection,
  });

  assert.deepEqual(sessionParams, [1, SESSION_STATUS_COMPLETED]);
  assert.equal(stats.hasCompletedSessions, true);
  assert.deepEqual(stats.topicScores, [
    { themeId: 1, themeName: "Тема A", overallPercent: 80, lastPercent: 80 },
    { themeId: 2, themeName: "Тема B", overallPercent: null, lastPercent: null },
  ]);
  assert.equal(connection.released, true);
});

test("getStudentTopicStats: no themes returned still releases the connection", async () => {
  const connection = fakeConnection(() => []);

  const stats = await getStudentTopicStats(1, {
    getConnection: async () => connection,
  });

  assert.deepEqual(stats, { topicScores: [], hasCompletedSessions: false });
  assert.equal(connection.released, true);
});
