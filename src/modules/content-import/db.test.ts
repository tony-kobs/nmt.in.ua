import { test } from "node:test";
import assert from "node:assert/strict";
import type { SqlConnection } from "@/lib/db/mysql";
import { importToDatabase, type ImportDatasets } from "./db";
import { ContentImportError } from "./errors";

type Call = { kind: "query" | "execute"; sql: string; params: unknown[] };

function makeConnection(existingIds: Record<string, number[]>) {
  const calls: Call[] = [];
  let committed = false;
  let rolledBack = false;
  let released = false;

  const connection: SqlConnection = {
    beginTransaction: async () => {
      calls.push({ kind: "execute", sql: "BEGIN", params: [] });
    },
    query: async <T>(sql: string, params: unknown[] = []) => {
      calls.push({ kind: "query", sql, params });
      const table = /FROM (\w+)/.exec(sql)?.[1] ?? "";
      const known = new Set(existingIds[table] ?? []);
      const rows = params
        .filter((p) => known.has(p as number))
        .map((id) => ({ id }));
      return rows as unknown as T[];
    },
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ kind: "execute", sql, params });
      return { insertId: 0, affectedRows: params.length };
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

function baseDatasets(): ImportDatasets {
  return {
    themes: [{ id: 1, name: "Theme 1", description: "d", ord: 1 }],
    themeConnections: [{ id: 1, vertexStart: 1, vertexFinish: 1 }],
    quizTasks: [
      {
        id: 1,
        name: "Q1",
        taskText: "t",
        themeId: 1,
        answer1: "a",
        answer2: "b",
        answer3: "c",
        answer4: "d",
        rightAnswerN: 1,
        comments: "c",
        difficulty: 1,
      },
    ],
  };
}

test("importToDatabase commits, upserts in dependency order, and releases the connection", async () => {
  const mock = makeConnection({ themes: [1] });
  const summary = await importToDatabase(baseDatasets(), {
    getConnection: async () => mock.connection,
  });

  assert.equal(mock.isCommitted(), true);
  assert.equal(mock.isRolledBack(), false);
  assert.equal(mock.isReleased(), true);

  assert.deepEqual(summary.inserted, {
    themes: 0,
    themeConnections: 1,
    quizTasks: 1,
  });
  assert.deepEqual(summary.updated, {
    themes: 1,
    themeConnections: 0,
    quizTasks: 0,
  });
  assert.equal(summary.totalInserted, 2);
  assert.equal(summary.totalUpdated, 1);

  const executeSqls = mock.calls
    .filter((c) => c.kind === "execute")
    .map((c) => c.sql);
  const themesIdx = executeSqls.findIndex((s) =>
    s.startsWith("INSERT INTO themes"),
  );
  const connectionsIdx = executeSqls.findIndex((s) =>
    s.startsWith("INSERT INTO theme_connections"),
  );
  const quizTasksIdx = executeSqls.findIndex((s) =>
    s.startsWith("INSERT INTO quiz_tasks"),
  );
  assert.ok(
    themesIdx >= 0 &&
      connectionsIdx > themesIdx &&
      quizTasksIdx > connectionsIdx,
  );

  const themesInsert = mock.calls.find((c) =>
    c.sql.startsWith("INSERT INTO themes"),
  )!;
  assert.equal(
    themesInsert.sql,
    "INSERT INTO themes (id, name, description, ord) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), ord = VALUES(ord)",
  );
  assert.deepEqual(themesInsert.params, [1, "Theme 1", "d", 1]);
});

test("importToDatabase rolls back and does not commit when a theme reference is invalid, with no partial writes", async () => {
  const mock = makeConnection({ themes: [] });
  const datasets = baseDatasets();
  datasets.quizTasks[0].themeId = 999;

  await assert.rejects(
    () =>
      importToDatabase(datasets, {
        getConnection: async () => mock.connection,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContentImportError);
      assert.equal((error as ContentImportError).kind, "validation");
      assert.ok((error as ContentImportError).errors[0].includes("999"));
      return true;
    },
  );

  assert.equal(mock.isCommitted(), false);
  assert.equal(mock.isRolledBack(), true);
  assert.equal(mock.isReleased(), true);

  const executeSqls = mock.calls
    .filter((c) => c.kind === "execute")
    .map((c) => c.sql);
  assert.ok(
    !executeSqls.some((s) => s.startsWith("INSERT INTO theme_connections")),
  );
  assert.ok(!executeSqls.some((s) => s.startsWith("INSERT INTO quiz_tasks")));
});

test("importToDatabase rolls back and wraps unexpected SQL failures as a generic server error", async () => {
  const failingConnection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T>() => [] as T[],
    execute: async () => {
      throw new Error("ER_LOCK_WAIT_TIMEOUT: real credentials leaked here");
    },
    commit: async () => {
      throw new Error("should not be called");
    },
    rollback: async () => {},
    release: () => {},
  };

  let released = false;
  const connection: SqlConnection = {
    ...failingConnection,
    release: () => {
      released = true;
    },
  };

  await assert.rejects(
    () =>
      importToDatabase(baseDatasets(), {
        getConnection: async () => connection,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContentImportError);
      assert.equal((error as ContentImportError).kind, "server");
      assert.deepEqual((error as ContentImportError).errors, [
        "Database operation failed.",
      ]);
      return true;
    },
  );
  assert.equal(released, true);
});

test("importToDatabase never passes the original error object to console.error, and never logs SQL/host/user/password", async () => {
  // Shaped like a real mysql2 connection error: carries host/user/password/sql on the object.
  class FakeMysqlError extends Error {
    code = "ER_ACCESS_DENIED_ERROR";
    sql = "INSERT INTO themes (id, name, description, ord) VALUES (?, ?, ?, ?)";
    host = "10.0.0.5";
    user = "root";
    password = "hunter2";
    constructor() {
      super("Access denied for user 'root'@'10.0.0.5' (using password: YES)");
      this.name = "FakeMysqlError";
    }
  }

  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T>() => [] as T[],
    execute: async () => {
      throw new FakeMysqlError();
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };

  const calls: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    calls.push(args);
  };

  try {
    await assert.rejects(() =>
      importToDatabase(baseDatasets(), {
        getConnection: async () => connection,
      }),
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [
    "content_import.db",
    "db:ER_ACCESS_DENIED_ERROR",
  ]);

  const loggedText = JSON.stringify(calls);
  for (const secret of [
    "hunter2",
    "root",
    "10.0.0.5",
    "INSERT INTO themes",
    "Access denied",
  ]) {
    assert.ok(
      !loggedText.includes(secret),
      `expected log output to omit "${secret}"`,
    );
  }
});
