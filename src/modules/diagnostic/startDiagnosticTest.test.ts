import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import {
  DIAGNOSTIC_MAX_THEMES,
  DIAGNOSTIC_TASKS_PER_THEME,
  StartDiagnosticTestError,
  startDiagnosticTest,
} from "./startDiagnosticTest";

type Call = { sql: string; params: unknown[] };

/**
 * `eligibleThemeIds` stands in for the themes the `HAVING COUNT(*) >= 3`
 * query would return (already capped/ordered) — the mock does not
 * re-implement the SQL's own filtering, it just returns what the "real"
 * query is asserted to have been asked for.
 */
function makeConnection(options: {
  eligibleThemeIds: number[];
  tasksPerTheme?: Map<number, number[]>;
  failMapping?: boolean;
}) {
  const calls: Call[] = [];
  let rolledBack = false;
  let committed = false;
  let released = false;
  const nextSessionId = 500;

  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>(sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM themes")) {
        return options.eligibleThemeIds.map((id) => ({
          theme_id: id,
        })) as unknown as T[];
      }
      if (sql.includes("FROM quiz_tasks")) {
        const themeId = params[0] as number;
        const ids =
          options.tasksPerTheme?.get(themeId) ??
          Array.from(
            { length: DIAGNOSTIC_TASKS_PER_THEME },
            (_, i) => themeId * 1000 + i,
          );
        return ids.map((id) => ({ id })) as unknown as T[];
      }
      return [] as T[];
    },
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("CREATE TABLE")) {
        return { insertId: 0, affectedRows: 0 };
      }
      if (sql.includes("INSERT INTO user_self_scores")) {
        return { insertId: 1, affectedRows: 1 };
      }
      if (sql.includes("INSERT INTO task_sessions")) {
        return { insertId: nextSessionId, affectedRows: 1 };
      }
      if (sql.includes("INSERT INTO tasks2session")) {
        const rowCount = params.length / 6;
        return {
          insertId: 0,
          affectedRows: options.failMapping ? rowCount - 1 : rowCount,
        };
      }
      return { insertId: 0, affectedRows: 0 };
    },
    commit: async () => {
      committed = true;
    },
    rollback: async () => {
      rolledBack = true;
    },
    release: () => {
      released = true;
    },
  };

  return {
    connection,
    calls,
    isCommitted: () => committed,
    isRolledBack: () => rolledBack,
    isReleased: () => released,
  };
}

test("uses session_type = 5", async () => {
  const mock = makeConnection({ eligibleThemeIds: [1, 2] });
  await startDiagnosticTest(
    { owner: { userId: 7, guestToken: null }, selfScore: 5 },
    { getConnection: async () => mock.connection },
  );

  const sessionInsert = mock.calls.find((c) =>
    c.sql.includes("INSERT INTO task_sessions"),
  );
  assert.ok(sessionInsert);
  assert.equal(sessionInsert!.params[2], 5);
});

test("selects exactly 3 tasks per eligible theme", async () => {
  const mock = makeConnection({ eligibleThemeIds: [1, 2, 3] });
  const result = await startDiagnosticTest(
    { owner: { userId: 7, guestToken: null }, selfScore: 5 },
    { getConnection: async () => mock.connection },
  );

  assert.equal(result.taskIds.length, 3 * DIAGNOSTIC_TASKS_PER_THEME);
  assert.deepEqual(result.themeIds, [1, 2, 3]);

  const taskSelects = mock.calls.filter((c) => c.sql.includes("FROM quiz_tasks"));
  assert.equal(taskSelects.length, 3);
  for (const call of taskSelects) {
    assert.match(call.sql, new RegExp(`LIMIT ${DIAGNOSTIC_TASKS_PER_THEME}$`));
  }
});

test("caps at DIAGNOSTIC_MAX_THEMES themes and DIAGNOSTIC_MAX_THEMES*3 tasks", async () => {
  const eligibleThemeIds = Array.from({ length: DIAGNOSTIC_MAX_THEMES }, (_, i) => i + 1);
  const mock = makeConnection({ eligibleThemeIds });

  const eligibleQuery = mock.connection.query;
  let sawLimitClause = false;
  const wrapped: SqlConnection = {
    ...mock.connection,
    query: async (sql, params) => {
      if (sql.includes("FROM themes")) {
        sawLimitClause = new RegExp(`LIMIT ${DIAGNOSTIC_MAX_THEMES}\\b`).test(sql);
      }
      return eligibleQuery(sql, params);
    },
  };

  const result = await startDiagnosticTest(
    { owner: { userId: 7, guestToken: null }, selfScore: 5 },
    { getConnection: async () => wrapped },
  );

  assert.ok(sawLimitClause, "eligible-themes query must cap with LIMIT");
  assert.equal(result.themeIds.length, DIAGNOSTIC_MAX_THEMES);
  assert.equal(result.taskIds.length, DIAGNOSTIC_MAX_THEMES * DIAGNOSTIC_TASKS_PER_THEME);
});

test("themes with fewer than 3 tasks are excluded by the HAVING clause", async () => {
  // The mock stands in for the DB filter: only themes the (already-filtered)
  // eligible-themes query returns are ever asked for tasks.
  const mock = makeConnection({ eligibleThemeIds: [2] });
  const result = await startDiagnosticTest(
    { owner: { userId: 7, guestToken: null }, selfScore: 5 },
    { getConnection: async () => mock.connection },
  );
  assert.deepEqual(result.themeIds, [2]);

  const eligibleThemesQuery = mock.calls.find((c) => c.sql.includes("FROM themes"));
  assert.match(eligibleThemesQuery!.sql, /HAVING COUNT\(q\.id\) >= 3/);
});

test("rejects an invalid self-score before touching the database", async () => {
  let called = false;
  await assert.rejects(
    () =>
      startDiagnosticTest(
        { owner: { userId: 7, guestToken: null }, selfScore: 11 },
        {
          getConnection: async () => {
            called = true;
            throw new Error("should not be called");
          },
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof StartDiagnosticTestError);
      assert.equal((error as StartDiagnosticTestError).code, "invalid_input");
      return true;
    },
  );
  assert.equal(called, false);
});

test("rejects an ambiguous owner before touching the database", async () => {
  await assert.rejects(
    () =>
      startDiagnosticTest(
        { owner: { userId: 7, guestToken: "guest-a" }, selfScore: 5 },
        { getConnection: async () => { throw new Error("should not be called"); } },
      ),
    (error: unknown) =>
      error instanceof StartDiagnosticTestError && error.code === "invalid_input",
  );
});

test("rolls back and reports insufficient_tasks when no theme is eligible", async () => {
  const mock = makeConnection({ eligibleThemeIds: [] });
  await assert.rejects(
    () =>
      startDiagnosticTest(
        { owner: { userId: 7, guestToken: null }, selfScore: 5 },
        { getConnection: async () => mock.connection },
      ),
    (error: unknown) => {
      assert.ok(error instanceof StartDiagnosticTestError);
      assert.equal((error as StartDiagnosticTestError).code, "insufficient_tasks");
      return true;
    },
  );

  assert.ok(mock.isRolledBack());
  assert.ok(!mock.isCommitted());
  assert.ok(mock.isReleased());
  const selfScoreInsert = mock.calls.find((c) =>
    c.sql.includes("INSERT INTO user_self_scores"),
  );
  assert.equal(selfScoreInsert, undefined, "no orphan self-score row on failure");
});

test("rolls back the whole transaction when the mapping insert fails partially", async () => {
  const mock = makeConnection({ eligibleThemeIds: [1], failMapping: true });
  await assert.rejects(
    () =>
      startDiagnosticTest(
        { owner: { userId: 7, guestToken: null }, selfScore: 5 },
        { getConnection: async () => mock.connection },
      ),
    (error: unknown) =>
      error instanceof StartDiagnosticTestError && error.code === "db_error",
  );

  assert.ok(mock.isRolledBack());
  assert.ok(!mock.isCommitted());
  assert.ok(mock.isReleased());
});

test("commits and releases the connection on success", async () => {
  const mock = makeConnection({ eligibleThemeIds: [1, 2] });
  await startDiagnosticTest(
    { owner: { userId: 7, guestToken: null }, selfScore: 8 },
    { getConnection: async () => mock.connection },
  );
  assert.ok(mock.isCommitted());
  assert.ok(!mock.isRolledBack());
  assert.ok(mock.isReleased());
});

test("writes the self-score row with the owner and score, theme_id NULL, source diagnostic_overall", async () => {
  const mock = makeConnection({ eligibleThemeIds: [1] });
  await startDiagnosticTest(
    { owner: { userId: null, guestToken: "guest-a" }, selfScore: 9 },
    { getConnection: async () => mock.connection },
  );

  const insert = mock.calls.find((c) => c.sql.includes("INSERT INTO user_self_scores"));
  assert.ok(insert);
  assert.match(insert!.sql, /diagnostic_overall/);
  assert.deepEqual(insert!.params, [null, "guest-a", 9]);
});

test("writes task_sessions and tasks2session rows for a guest owner", async () => {
  const mock = makeConnection({ eligibleThemeIds: [1] });
  await startDiagnosticTest(
    { owner: { userId: null, guestToken: "guest-a" }, selfScore: 5 },
    { getConnection: async () => mock.connection },
  );

  const sessionInsert = mock.calls.find((c) => c.sql.includes("INSERT INTO task_sessions"));
  assert.deepEqual(sessionInsert!.params.slice(0, 2), [null, "guest-a"]);

  const mappingInsert = mock.calls.find((c) => c.sql.includes("INSERT INTO tasks2session"));
  // columns: task_type, task_id, session_id, user_id, guest_token, status
  assert.equal(mappingInsert!.params[3], null);
  assert.equal(mappingInsert!.params[4], "guest-a");
});

test("prevents a duplicate submission while a request is already pending for the same owner", async () => {
  const mock = makeConnection({ eligibleThemeIds: [1] });

  let releaseFirst: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const slowConnection: SqlConnection = {
    ...mock.connection,
    beginTransaction: async () => {
      await gate;
    },
  };

  const first = startDiagnosticTest(
    { owner: { userId: 42, guestToken: null }, selfScore: 5 },
    { getConnection: async () => slowConnection },
  );

  await assert.rejects(
    () =>
      startDiagnosticTest(
        { owner: { userId: 42, guestToken: null }, selfScore: 5 },
        { getConnection: async () => mock.connection },
      ),
    (error: unknown) =>
      error instanceof StartDiagnosticTestError &&
      error.code === "already_in_progress",
  );

  releaseFirst();
  await first;
});
