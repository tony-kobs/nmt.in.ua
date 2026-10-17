import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { countStage2CatalogTasks, getRound, finishRound, skipRoundTask, startRound, startMistakeRound, listRounds, toRoundSnapshot, RoundError, type RoundMode } from "./rounds";
import { withRound, getRoundContext } from "./roundContext";
import { runStage2Attempt, peekStage2Attempt } from "./stage2Attempt";
import { getStage2HintLevel } from "./hintLadder";

const entries = [
  { position: 1, format: "order" as const, task_id: 1, skipped: 0, first_attempt_status: -1 },
  { position: 2, format: "graph" as const, task_id: 2, skipped: 0, first_attempt_status: 1 },
  { position: 3, format: "blank" as const, task_id: 3, skipped: 1, first_attempt_status: null },
];
function fixture(mode: RoundMode = "practice", completed = false) {
  const round = { id: 10, mode, source_round_id: null as number | null, completed_at: completed ? 123 : null as number | null };
  const tasks = entries.map((task) => ({ ...task }));
  const calls: { sql: string; params: unknown[] }[] = [];
  let rollback = false;
  let commit = false;
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T>(sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM app_users")) return [{ id: 1 }] as T[];
      if (sql.includes("FROM practice_interactive_rounds WHERE id =")) return (params[0] === 10 && params[1] === 1 ? [round] : []) as T[];
      if (sql.includes("FROM practice_interactive_round_tasks rt")) return tasks as T[];
      if (sql.includes("FROM practice_interactive_rounds WHERE user_id")) return [round] as T[];
      return [];
    },
    execute: async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.startsWith("UPDATE practice_interactive_rounds")) round.completed_at = params[0] as number;
      if (sql.startsWith("UPDATE practice_interactive_round_tasks SET")) {
        const task = tasks.find((task) => task.format === params[1] && task.task_id === params[2]);
        if (task) task.skipped = 1;
      }
      return { insertId: 11, affectedRows: 1 };
    },
    commit: async () => { commit = true; },
    rollback: async () => { rollback = true; },
    release: () => {},
  };
  return { connection, calls, tasks, round, deps: { getConnection: async () => connection, nowSec: () => 456 }, didCommit: () => commit, didRollback: () => rollback };
}

test("active diagnostic reveals completion state but no primary correctness or score", () => {
  const result = toRoundSnapshot({ id: 10, mode: "diagnostic", source_round_id: null, completed_at: null }, entries);
  assert.deepEqual(result.tasks.map((task) => task.answered), [true, true, false]);
  assert.deepEqual(result.tasks.map((task) => task.firstCorrect), [null, null, null]);
  assert.equal(result.firstCorrectCount, null);
});
test("completed diagnostic exposes immutable primary score and skipped tasks", () => {
  const result = toRoundSnapshot({ id: 10, mode: "diagnostic", source_round_id: null, completed_at: 42 }, entries);
  assert.equal(result.firstCorrectCount, 1);
  assert.deepEqual(result.tasks.map((task) => task.firstCorrect), [false, true, null]);
  assert.equal(result.tasks[2].skipped, true);
});
test("owner reads use both round and owner identifiers", async () => {
  const mock = fixture();
  await assert.rejects(() => getRound(2, 10, mock.deps), (error: unknown) => error instanceof RoundError && error.code === "not_found");
  assert.deepEqual(mock.calls[0].params, [10, 2]);
});
test("invalid identifier fails before acquiring database connection", async () => {
  const mock = fixture();
  await assert.rejects(() => getRound(1, -1, mock.deps), RoundError);
  assert.equal(mock.calls.length, 0);
});
test("finish locks owner before round and is idempotent", async () => {
  const mock = fixture("diagnostic");
  const result = await finishRound(1, 10, mock.deps);
  assert.equal(result.completed, true);
  assert.equal(result.firstCorrectCount, 1);
  assert.ok(mock.calls[0].sql.includes("app_users"));
  assert.ok(mock.calls[1].sql.endsWith("FOR UPDATE"));
  assert.equal(mock.didCommit(), true);
  const firstWrites = mock.calls.filter((call) => call.sql.startsWith("UPDATE")).length;
  await finishRound(1, 10, mock.deps);
  assert.equal(mock.calls.filter((call) => call.sql.startsWith("UPDATE")).length, firstWrites);
});
test("completed rounds cannot be skipped or changed", async () => {
  const mock = fixture("practice", true);
  await assert.rejects(() => skipRoundTask(1, 10, "blank", 3, mock.deps), (error: unknown) => error instanceof RoundError && error.code === "not_eligible");
  assert.equal(mock.didRollback(), true);
});
test("skip does not overwrite an already submitted primary result", async () => {
  const mock = fixture();
  await skipRoundTask(1, 10, "order", 1, mock.deps);
  assert.equal(mock.calls.some((call) => call.sql.startsWith("UPDATE")), false);
});
test("start resumes active round instead of duplicating a concurrent start", async () => {
  const mock = fixture();
  const result = await startRound(1, "practice", mock.deps);
  assert.equal(result.id, 10);
  assert.equal(mock.calls.some((call) => call.sql.startsWith("INSERT")), false);
  assert.ok(mock.calls[0].sql.includes("FOR UPDATE"));
});
test("mistake round cannot reveal an active diagnostic result", async () => {
  const mock = fixture("diagnostic");
  await assert.rejects(() => startMistakeRound(1, 10, mock.deps), (error: unknown) => error instanceof RoundError && error.code === "not_eligible");
  assert.equal(mock.didRollback(), true);
});
test("round listing is owner scoped and contains no answers", async () => {
  const mock = fixture();
  assert.deepEqual(await listRounds(1, mock.deps), [{ id: 10, mode: "practice", completed: false, sourceRoundId: null }]);
  assert.deepEqual(mock.calls[0].params, [1]);
});
test("round context validates membership and does not escape callback", async () => {
  const mock = fixture("diagnostic");
  await assert.rejects(() => withRound(1, 10, "matching", 1, async () => null, mock.deps), RoundError);
  const result = await withRound(1, 10, "order", 1, async () => getRoundContext(), mock.deps);
  assert.deepEqual(result, { roundId: 10, userId: 1, mode: "diagnostic", completed: false });
  assert.equal(getRoundContext(), undefined);
});

test("mistake round includes primary wrong despite retry success and unanswered, excluding primary correct", async () => {
  const mock = fixture("diagnostic", true);
  const originalQuery = mock.connection.query;
  mock.connection.query = async <T>(sql: string, params: unknown[] = []) => {
    if (sql.includes("WHERE user_id = ? AND source_round_id = ?")) return [];
    if (sql.includes("WHERE id = ? AND user_id = ?") && params[0] === 11) {
      return [{ id: 11, mode: "practice", source_round_id: 10, completed_at: null }] as T[];
    }
    return originalQuery<T>(sql, params);
  };
  const result = await startMistakeRound(1, 10, mock.deps);
  assert.equal(result.id, 11);
  assert.equal(result.mode, "practice");
  const insertedTasks = mock.calls.filter((call) => call.sql.startsWith("INSERT INTO practice_interactive_round_tasks"));
  assert.deepEqual(insertedTasks.map((call) => call.params), [[11, 1, "order", 1], [11, 2, "blank", 3]]);
});

test("active diagnostic never exposes prior answers or hints and never scores a second answer", async () => {
  const mock = fixture("diagnostic");
  const query = mock.connection.query;
  mock.connection.query = async <T>(sql: string, params: unknown[] = []) => {
    if (sql.includes("SELECT r.completed_at")) return [{ completed_at: null, skipped: 0 }] as T[];
    if (sql.includes("FROM practice_stage2_attempts")) {
      assert.equal(params[3], 10);
      return [{ id: 1, status: -1, first_attempt_status: -1, retry_used: 0 }] as T[];
    }
    return query<T>(sql, params);
  };
  await withRound(1, 10, "order", 1, async () => {
    assert.equal(await peekStage2Attempt(mock.connection, "order", 1, 1), null);
    assert.deepEqual(await getStage2HintLevel(mock.connection, "order", 1, 1, 1,
      { direction: "hint", rule: "rule", explanation: "secret" }),
      { available: false, level: null, text: null, isFinal: false });
    const answer = await runStage2Attempt(mock.connection,
      { userId: 1, taskId: 1, format: "order", nowSec: 123, expectedAttempt: 2 },
      () => { throw new Error("must not rescore diagnostic"); }, () => "secret");
    assert.deepEqual(answer, { correct: false, firstAttempt: false });
  }, mock.deps);
});

test("round completion between authorization and submission prevents a late write", async () => {
  const mock = fixture("practice");
  const query = mock.connection.query;
  mock.connection.query = async <T>(sql: string, params: unknown[] = []) => {
    if (sql.includes("SELECT r.completed_at")) return [{ completed_at: 456, skipped: 0 }] as T[];
    return query<T>(sql, params);
  };
  await withRound(1, 10, "order", 1, async () => {
    await assert.rejects(() => runStage2Attempt(mock.connection,
      { userId: 1, taskId: 1, format: "order", nowSec: 456, expectedAttempt: 1 },
      () => true, () => "secret"), /completed/);
  }, mock.deps);
});
test("new round keeps the whole catalog, grouped by format", async () => {
  const mock = fixture();
  const originalQuery = mock.connection.query;
  mock.connection.query = async <T>(sql: string, params: unknown[] = []) => {
    if (sql.includes("AND source_round_id IS NULL")) return [];
    if (sql.includes("task_id FROM order_tasks")) {
      return ["order", "find_error", "graph", "matching", "blank"].flatMap((format) => [1, 2, 3, 4].map((task_id) => ({ format, task_id }))) as T[];
    }
    if (sql.includes("WHERE id = ? AND user_id = ?") && params[0] === 11) {
      return [{ id: 11, mode: "practice", source_round_id: null, completed_at: null }] as T[];
    }
    return originalQuery<T>(sql, params);
  };
  await startRound(1, "practice", mock.deps);
  const insertedTasks = mock.calls.filter((call) => call.sql.startsWith("INSERT INTO practice_interactive_round_tasks"));
  assert.equal(insertedTasks.length, 20);
  assert.deepEqual(insertedTasks[0].params, [11, 1, "order", 1]);
  assert.deepEqual(insertedTasks[4].params, [11, 5, "find_error", 1]);
  assert.deepEqual(insertedTasks[19].params, [11, 20, "blank", 4]);
});

test("a chosen count samples that many distinct catalog tasks", async () => {
  const mock = fixture();
  const catalog = ["order", "find_error", "graph", "matching", "blank"].flatMap((format) =>
    [1, 2, 3, 4].map((task_id) => ({ format, task_id })),
  );
  let openRound = false;
  const originalQuery = mock.connection.query;
  mock.connection.query = async <T>(sql: string, params: unknown[] = []) => {
    if (sql.includes("AND source_round_id IS NULL")) return (openRound ? [{ id: 11 }] : []) as T[];
    if (sql.includes("task_id FROM order_tasks")) return catalog as T[];
    if (sql.includes("WHERE id = ? AND user_id = ?") && params[0] === 11) {
      return [{ id: 11, mode: "diagnostic", source_round_id: null, completed_at: null }] as T[];
    }
    return originalQuery<T>(sql, params);
  };
  await startRound(1, "diagnostic", mock.deps, 3);
  openRound = true;
  await startRound(1, "diagnostic", mock.deps, 3);
  const insertedTasks = mock.calls.filter((call) => call.sql.startsWith("INSERT INTO practice_interactive_round_tasks"));
  assert.equal(insertedTasks.length, 6);
  assert.equal(
    mock.calls.filter((call) => call.sql.startsWith("UPDATE practice_interactive_rounds SET completed_at")).length,
    1,
  );
  for (const sitting of [insertedTasks.slice(0, 3), insertedTasks.slice(3)]) {
    const keys = sitting.map((call) => `${call.params[2]}:${call.params[3]}`);
    assert.equal(new Set(keys).size, 3);
  }
  for (const call of insertedTasks) {
    assert.ok(catalog.some((task) => task.format === call.params[2] && task.task_id === call.params[3]));
  }
});

test("stage 2 catalog count returns the bank size and zero without caching an injected read", async () => {
  let released = 0;
  const depsFor = (total: number | "fail") => ({
    getConnection: async () => ({
      beginTransaction: async () => {},
      query: async <T>() => {
        if (total === "fail") throw new Error("missing table");
        return [{ total }] as T[];
      },
      execute: async () => ({ insertId: 0, affectedRows: 0 }),
      commit: async () => {},
      rollback: async () => {},
      release: () => {
        released += 1;
      },
    }) as SqlConnection,
  });

  assert.equal(await countStage2CatalogTasks(depsFor(0)), 0);
  assert.equal(await countStage2CatalogTasks(depsFor(4)), 4);
  assert.equal(await countStage2CatalogTasks(depsFor("fail")), 0);
  assert.equal(released, 3);
});
