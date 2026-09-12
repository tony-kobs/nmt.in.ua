import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { SESSION_STATUS_COMPLETED, SESSION_STATUS_CREATED } from "@/modules/sessions/types";
import { TASK_STATUS_CORRECT, TASK_STATUS_INCORRECT, TASK_STATUS_UNANSWERED } from "@/modules/testing/types";
import {
  DIAGNOSTIC_SUMMARY_THEME_ID,
  DIAGNOSTIC_SUMMARY_THEME_NAME,
  FinishDiagnosticSessionError,
  finishDiagnosticSession,
} from "./finishDiagnosticSession";

type SessionRow = {
  id: number;
  tasks_number: number;
  right_number: number;
  time: number;
  start_time: number;
  session_status: number;
  expire_time: number;
};

function makeConnection(options: {
  session: SessionRow | null;
  statuses: number[];
  nowSec?: number;
}) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  let rolledBack = false;
  let committed = false;

  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>(sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM task_sessions")) {
        return (options.session ? [options.session] : []) as unknown as T[];
      }
      if (sql.includes("FROM tasks2session")) {
        return options.statuses.map((status) => ({ status })) as unknown as T[];
      }
      return [] as T[];
    },
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("UPDATE task_sessions")) {
        return { insertId: 0, affectedRows: 1 };
      }
      return { insertId: 0, affectedRows: 0 };
    },
    commit: async () => {
      committed = true;
    },
    rollback: async () => {
      rolledBack = true;
    },
    release: () => {},
  };

  return {
    connection,
    calls,
    isCommitted: () => committed,
    isRolledBack: () => rolledBack,
  };
}

const owner = { userId: null, guestToken: "guest-a" };

test("aggregates answers into a diagnostic summary with the sentinel theme fields", async () => {
  const mock = makeConnection({
    session: { id: 5, tasks_number: 6, right_number: 0, time: 0, start_time: 100, session_status: SESSION_STATUS_CREATED, expire_time: 9_999_999_999 },
    statuses: [TASK_STATUS_CORRECT, TASK_STATUS_CORRECT, TASK_STATUS_INCORRECT, TASK_STATUS_CORRECT, TASK_STATUS_INCORRECT, TASK_STATUS_CORRECT],
  });

  const summary = await finishDiagnosticSession(
    { owner, sessionId: 5 },
    { getConnection: async () => mock.connection, nowSec: () => 160 },
  );

  assert.equal(summary.themeId, DIAGNOSTIC_SUMMARY_THEME_ID);
  assert.equal(summary.themeName, DIAGNOSTIC_SUMMARY_THEME_NAME);
  assert.equal(summary.rightNumber, 4);
  assert.equal(summary.tasksNumber, 6);
  assert.ok(mock.isCommitted());
});

test("rejects when any mapping is still unanswered", async () => {
  const mock = makeConnection({
    session: { id: 5, tasks_number: 3, right_number: 0, time: 0, start_time: 100, session_status: SESSION_STATUS_CREATED, expire_time: 9_999_999_999 },
    statuses: [TASK_STATUS_CORRECT, TASK_STATUS_UNANSWERED, TASK_STATUS_INCORRECT],
  });

  await assert.rejects(
    () => finishDiagnosticSession({ owner, sessionId: 5 }, { getConnection: async () => mock.connection }),
    (error: unknown) =>
      error instanceof FinishDiagnosticSessionError && error.code === "unfinished",
  );
  assert.ok(mock.isRolledBack());
});

test("rejects finishing an active diagnostic session past its 24h deadline", async () => {
  const now = 1_700_000_000;
  const mock = makeConnection({
    session: { id: 5, tasks_number: 3, right_number: 0, time: 0, start_time: 100, session_status: SESSION_STATUS_CREATED, expire_time: now - 1 },
    statuses: [TASK_STATUS_CORRECT, TASK_STATUS_CORRECT, TASK_STATUS_INCORRECT],
  });

  await assert.rejects(
    () =>
      finishDiagnosticSession(
        { owner, sessionId: 5 },
        { getConnection: async () => mock.connection, nowSec: () => now },
      ),
    (error: unknown) =>
      error instanceof FinishDiagnosticSessionError &&
      error.code === "session_expired",
  );
  assert.ok(mock.isRolledBack());
});

test("guest A cannot finish guest B's session (owner mismatch -> not_found)", async () => {
  const mock = makeConnection({ session: null, statuses: [] });
  await assert.rejects(
    () => finishDiagnosticSession({ owner, sessionId: 5 }, { getConnection: async () => mock.connection }),
    (error: unknown) =>
      error instanceof FinishDiagnosticSessionError && error.code === "not_found",
  );
  assert.ok(mock.isRolledBack());
});

test("returns the stored summary without UPDATE when already completed", async () => {
  const mock = makeConnection({
    session: { id: 5, tasks_number: 6, right_number: 4, time: 42, start_time: 100, session_status: SESSION_STATUS_COMPLETED, expire_time: 1 },
    statuses: [],
  });

  const summary = await finishDiagnosticSession(
    { owner, sessionId: 5 },
    { getConnection: async () => mock.connection },
  );
  assert.equal(summary.rightNumber, 4);
  assert.equal(mock.calls.filter((c) => c.sql.trim().startsWith("UPDATE")).length, 0);
});
