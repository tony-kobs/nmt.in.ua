import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { getLatestSelfScoresForResults } from "./getLatestSelfScoresForResults";

function makeConnection(rows: unknown[]) {
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async () => rows as never[],
    execute: async () => ({ insertId: 0, affectedRows: 0 }),
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };
  return connection;
}

test("getLatestSelfScoresForResults resolves the latest pre_topic score per theme", async () => {
  const connection = makeConnection([
    { theme_id: 2, score: 8, source: "pre_topic" },
    { theme_id: 2, score: 1, source: "pre_topic" },
  ]);
  const latest = await getLatestSelfScoresForResults(1, {
    getConnection: async () => connection,
  });
  assert.equal(latest.byTheme.get(2), 8);
});

test("getLatestSelfScoresForResults falls back to diagnostic_overall when no pre_topic exists", async () => {
  const connection = makeConnection([
    { theme_id: null, score: 5, source: "diagnostic_overall" },
  ]);
  const latest = await getLatestSelfScoresForResults(1, {
    getConnection: async () => connection,
  });
  assert.equal(latest.byTheme.size, 0);
  assert.equal(latest.overall, 5);
});

test("getLatestSelfScoresForResults returns no value when the user has no self-scores", async () => {
  const connection = makeConnection([]);
  const latest = await getLatestSelfScoresForResults(1, {
    getConnection: async () => connection,
  });
  assert.equal(latest.overall, null);
  assert.equal(latest.byTheme.size, 0);
});
