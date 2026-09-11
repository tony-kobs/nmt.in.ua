import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import {
  pickPracticeFollowUpTaskId,
  selectFollowUpCandidate,
} from "./pickPracticeFollowUpTask";

test("selectFollowUpCandidate excludes already-used tasks", () => {
  const candidates = [
    { id: 1, difficulty: 1 },
    { id: 2, difficulty: 1 },
  ];
  assert.equal(selectFollowUpCandidate(candidates, [1, 2], null), null);
  assert.equal(selectFollowUpCandidate(candidates, [1], null), 2);
});

test("selectFollowUpCandidate prefers a candidate at/above the preferred difficulty", () => {
  const candidates = [
    { id: 1, difficulty: 1 },
    { id: 2, difficulty: 2 },
    { id: 3, difficulty: 3 },
  ];
  for (let i = 0; i < 20; i += 1) {
    const picked = selectFollowUpCandidate(candidates, [], 2);
    assert.ok(picked === 2 || picked === 3, `expected a harder pick, got ${picked}`);
  }
});

test("selectFollowUpCandidate falls back to any candidate when none meet the preferred difficulty", () => {
  const candidates = [
    { id: 1, difficulty: 1 },
    { id: 2, difficulty: 1 },
  ];
  const picked = selectFollowUpCandidate(candidates, [], 3);
  assert.ok([1, 2].includes(picked!));
});

test("selectFollowUpCandidate ignores difficulty entirely when no preference is given", () => {
  const candidates = [{ id: 1, difficulty: 1 }, { id: 2, difficulty: 3 }];
  const picked = selectFollowUpCandidate(candidates, [], null);
  assert.ok([1, 2].includes(picked!));
});

test("selectFollowUpCandidate returns null when the theme bank is exhausted", () => {
  assert.equal(selectFollowUpCandidate([], [], null), null);
});

function makeConnection(rows: unknown[]) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  let released = false;
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>(sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return rows as unknown as T[];
    },
    execute: async () => ({ insertId: 0, affectedRows: 0 }),
    commit: async () => {},
    rollback: async () => {},
    release: () => {
      released = true;
    },
  };
  return { connection, calls, isReleased: () => released };
}

test("pickPracticeFollowUpTaskId queries the theme's candidates and releases the connection", async () => {
  const mock = makeConnection([
    { id: 5, difficulty: 1 },
    { id: 6, difficulty: 1 },
  ]);

  const picked = await pickPracticeFollowUpTaskId(
    { themeId: 7, excludeTaskIds: [5], preferredDifficulty: null },
    { getConnection: async () => mock.connection },
  );

  assert.equal(picked, 6);
  assert.equal(mock.calls.length, 1);
  assert.match(mock.calls[0]!.sql, /FROM quiz_tasks WHERE theme_id = \?/);
  assert.deepEqual(mock.calls[0]!.params, [7]);
  assert.ok(mock.isReleased());
});
