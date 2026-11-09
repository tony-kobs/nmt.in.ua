import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import {
  loadTopicTaskHistories,
  pickFreshTaskIds,
  type TopicTaskHistory,
} from "./pickFreshTasks";

function history(
  issued: readonly number[],
  solved: readonly number[] = [],
): TopicTaskHistory {
  return { issued: new Set(issued), solved: new Set(solved) };
}

/** Deterministic stand-in for Math.random. Returns values in [0, 1). */
function sequence(values: readonly number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index] ?? 0;
    index += 1;
    return value;
  };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("pickFreshTaskIds shuffles a fresh pool instead of keeping id order", () => {
  const picked = pickFreshTaskIds(
    [1, 2, 3, 4],
    [],
    3,
    sequence([0.9, 0.1, 0.4, 0.2]),
  );
  assert.deepEqual(picked, [2, 4, 3]);
});

test("two seeds can draw different fresh tasks", () => {
  const pool = [1, 2, 3, 4, 5, 6, 7, 8];
  const draws = [1, 2, 3, 4, 5].map((seed) =>
    pickFreshTaskIds(pool, [], 3, mulberry32(seed)),
  );
  for (const draw of draws) {
    assert.equal(draw.length, 3);
    assert.equal(new Set(draw).size, 3);
    assert.ok(draw.every((id) => pool.includes(id)));
  }
  assert.ok(draws.some((draw) => !sameIds(draw, draws[0]!)));
});

function sameIds(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

test("fresh tasks come before issued-unsolved, then solved repeats", () => {
  const picked = pickFreshTaskIds(
    [1, 2, 3, 4],
    [history([1, 2], [1])],
    4,
    sequence([0, 0, 0, 0]),
  );
  assert.deepEqual(picked.slice(0, 2).sort((a, b) => a - b), [3, 4]);
  assert.equal(picked[2], 2);
  assert.equal(picked[3], 1);
});

test("a later draw does not repeat while unseen tasks remain", () => {
  const pool = [10, 20, 30, 40];
  const random = mulberry32(7);
  const first = pickFreshTaskIds(pool, [], 2, random);
  const second = pickFreshTaskIds(pool, [history(first)], 2, random);
  assert.equal(first.length, 2);
  assert.equal(second.length, 2);
  assert.equal(first.some((id) => second.includes(id)), false);
  assert.deepEqual(
    [...first, ...second].sort((a, b) => a - b),
    [10, 20, 30, 40],
  );
});

test("a solved task is a repeat even if it was missing from issued", () => {
  const picked = pickFreshTaskIds(
    [1, 2],
    [{ issued: new Set(), solved: new Set([1]) }],
    2,
    sequence([0, 0]),
  );
  assert.deepEqual(picked, [2, 1]);
});

test("a class draw prefers tasks that are new for more students", () => {
  const picked = pickFreshTaskIds(
    [1, 2, 3, 4],
    [history([1, 2]), history([])],
    2,
    sequence([0.2, 0.8, 0.1, 0.3]),
  );
  assert.deepEqual(picked.slice().sort((a, b) => a - b), [3, 4]);
});

test("pickFreshTaskIds drops bad ids and honors a zero limit", () => {
  assert.deepEqual(pickFreshTaskIds([1, 1, 0, -3, 2], [], 5, () => 0), [1, 2]);
  assert.deepEqual(pickFreshTaskIds([1, 2], [], 0), []);
  assert.deepEqual(pickFreshTaskIds([], [history([1])], 3), []);
});

test("loadTopicTaskHistories keeps an empty record per student", async () => {
  const calls: string[] = [];
  const connection = {
    query: async (sql: string) => {
      calls.push(sql);
      if (sql.includes("topic-task-attempts")) {
        return [
          { user_id: "5", task_id: "10", solved: "1" },
          { user_id: 5, task_id: 11, solved: 0 },
        ];
      }
      if (sql.includes("topic-task-assigned")) {
        return [{ user_id: 9, task_id: 12 }];
      }
      return [];
    },
  } as unknown as SqlConnection;

  const rows = await loadTopicTaskHistories(connection, [5, 9, 5], 4);
  assert.equal(rows.length, 3);
  assert.deepEqual([...rows[0]!.issued].sort((a, b) => a - b), [10, 11]);
  assert.deepEqual([...rows[0]!.solved], [10]);
  assert.deepEqual([...rows[1]!.issued], [12]);
  assert.equal(rows[1]!.solved.size, 0);
  assert.deepEqual([...rows[2]!.issued].sort((a, b) => a - b), [10, 11]);
  assert.equal(calls.length, 2);
  assert.match(calls[0]!, /task_type = 1/);
  assert.match(calls[0]!, /IN \(\?, \?\)/);
  assert.match(calls[1]!, /a\.status = 'active'/);
});

test("loadTopicTaskHistories does not query when nobody was asked", async () => {
  let called = false;
  const connection = {
    query: async () => {
      called = true;
      return [];
    },
  } as unknown as SqlConnection;
  const rows = await loadTopicTaskHistories(connection, [], 4);
  assert.deepEqual(rows, []);
  assert.equal(called, false);
});
