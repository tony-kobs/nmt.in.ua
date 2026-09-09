import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import {
  SESSION_STATUS_PLANNED,
  SESSION_TYPE_AUTO,
} from "@/modules/sessions/types";
import { TOPIC_TEST_TASK_COUNT } from "@/modules/testing/startTopicTest";

import type { RecommendedAction } from "./index";
import { persistRecommendations } from "./persistRecommendations";

function topicTestAction(themeId: number): RecommendedAction {
  return {
    type: "topic-test",
    themeId,
    title: `Повторіть тему ${themeId}`,
    reason: "test",
    href: `/?theme=${themeId}`,
    priority: 1,
  };
}

function makeConnection(options: {
  planned?: Array<{ id: number; theme_id: number }>;
  insertId?: number;
} = {}) {
  const executeCalls: Array<{ sql: string; params: unknown[] }> = [];
  let insertCounter = options.insertId ?? 100;

  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async (sql) => {
      if (sql.includes("SELECT id, theme_id")) {
        return (options.planned ?? []) as never[];
      }
      return [] as never[];
    },
    execute: async (sql, params: unknown[] = []) => {
      executeCalls.push({ sql, params });
      if (sql.includes("INSERT INTO task_sessions")) {
        insertCounter += 1;
        return { insertId: insertCounter, affectedRows: 1 };
      }
      return { insertId: 0, affectedRows: 1 };
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };

  return { connection, executeCalls };
}

test("persistRecommendations creates planned auto session for topic-test action", async () => {
  const { connection, executeCalls } = makeConnection({ insertId: 200 });

  const result = await persistRecommendations(1, [topicTestAction(5)], {
    getConnection: async () => connection,
  });

  assert.equal(result.createdSessionIds.length, 1);
  assert.equal(result.actions[0]?.href, "/session/201");
  const insert = executeCalls.find((call) =>
    call.sql.includes("INSERT INTO task_sessions"),
  );
  assert.ok(insert);
  assert.deepEqual(insert?.params, [
    1,
    SESSION_TYPE_AUTO,
    5,
    TOPIC_TEST_TASK_COUNT,
    SESSION_STATUS_PLANNED,
  ]);
});

test("persistRecommendations does not duplicate planned auto session for same theme", async () => {
  const { connection, executeCalls } = makeConnection({
    planned: [{ id: 88, theme_id: 5 }],
  });

  const result = await persistRecommendations(1, [topicTestAction(5)], {
    getConnection: async () => connection,
  });

  assert.deepEqual(result.createdSessionIds, []);
  assert.equal(result.actions[0]?.href, "/session/88");
  assert.equal(
    executeCalls.filter((call) => call.sql.includes("INSERT INTO task_sessions"))
      .length,
    0,
  );
});

test("persistRecommendations removes stale planned auto sessions", async () => {
  const { connection, executeCalls } = makeConnection({
    planned: [{ id: 50, theme_id: 3 }],
  });

  await persistRecommendations(1, [topicTestAction(7)], {
    getConnection: async () => connection,
  });

  const staleDelete = executeCalls.find(
    (call) => call.sql.includes("theme_id NOT IN"),
  );
  assert.ok(staleDelete);
  assert.ok(staleDelete?.params.includes(7));
});

test("persistRecommendations with no topic-test actions clears all planned auto rows", async () => {
  const { connection, executeCalls } = makeConnection();

  await persistRecommendations(
    1,
    [
      {
        type: "materials",
        title: "Materials",
        reason: "test",
        href: "/materials/textbook",
        priority: 1,
      },
    ],
    { getConnection: async () => connection },
  );

  const deleteAll = executeCalls.find(
    (call) =>
      call.sql.includes("DELETE FROM task_sessions") &&
      !call.sql.includes("NOT IN"),
  );
  assert.ok(deleteAll);
});
