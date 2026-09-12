import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { SESSION_STATUS_COMPLETED, SESSION_STATUS_CREATED } from "@/modules/sessions/types";
import {
  GetDiagnosticSessionTasksError,
  getDiagnosticSessionTasks,
} from "./getDiagnosticSessionTasks";

function makeConnection(options: {
  header: Record<string, unknown> | null;
  tasks: Record<string, unknown>[];
}) {
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>(sql: string) => {
      if (sql.includes("FROM task_sessions")) {
        return (options.header ? [options.header] : []) as unknown as T[];
      }
      if (sql.includes("FROM tasks2session")) {
        return options.tasks as unknown as T[];
      }
      return [] as T[];
    },
    execute: async () => ({ insertId: 0, affectedRows: 0 }),
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };
  return connection;
}

const taskRow = {
  mapping_id: 1,
  task_id: 9,
  status: 0,
  name: "Задача",
  task_text: "2 + 2 = ?",
  answer_1: "3",
  answer_2: "4",
  answer_3: "5",
  answer_4: "6",
};

test("joins tasks2session with quiz_tasks and maps client-safe fields", async () => {
  const connection = makeConnection({
    header: {
      id: 5,
      tasks_number: 1,
      right_number: 0,
      time: 0,
      session_status: SESSION_STATUS_CREATED,
      expire_time: 9_999_999_999,
    },
    tasks: [taskRow],
  });

  const result = await getDiagnosticSessionTasks(5, { userId: 1, guestToken: null }, {
    getConnection: async () => connection,
  });

  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0]!.taskId, 9);
  assert.doesNotMatch(JSON.stringify(result), /right_answer_n/);
});

test("guest A cannot read guest B's diagnostic session (owner mismatch -> session_not_found)", async () => {
  const connection = makeConnection({ header: null, tasks: [] });
  await assert.rejects(
    () =>
      getDiagnosticSessionTasks(5, { userId: null, guestToken: "guest-a" }, {
        getConnection: async () => connection,
      }),
    (error: unknown) =>
      error instanceof GetDiagnosticSessionTasksError &&
      error.code === "session_not_found",
  );
});

test("hydrates the diagnostic summary when the session is already completed", async () => {
  const connection = makeConnection({
    header: { id: 5, tasks_number: 1, right_number: 1, time: 20, session_status: SESSION_STATUS_COMPLETED },
    tasks: [taskRow],
  });

  const result = await getDiagnosticSessionTasks(5, { userId: 1, guestToken: null }, {
    getConnection: async () => connection,
  });
  assert.ok(result.summary);
  assert.equal(result.summary!.rightNumber, 1);
});

test("rejects an active diagnostic session past its 24h deadline", async () => {
  const now = 1_700_000_000;
  const connection = makeConnection({
    header: {
      id: 5,
      tasks_number: 1,
      right_number: 0,
      time: 0,
      session_status: SESSION_STATUS_CREATED,
      expire_time: now - 1,
    },
    tasks: [taskRow],
  });

  await assert.rejects(
    () =>
      getDiagnosticSessionTasks(5, { userId: 1, guestToken: null }, {
        getConnection: async () => connection,
        nowSec: () => now,
      }),
    (error: unknown) =>
      error instanceof GetDiagnosticSessionTasksError &&
      error.code === "session_expired",
  );
});

test("still reads a completed diagnostic session past its deadline (preserved results)", async () => {
  const now = 1_700_000_000;
  const connection = makeConnection({
    header: {
      id: 5,
      tasks_number: 1,
      right_number: 1,
      time: 20,
      session_status: SESSION_STATUS_COMPLETED,
      expire_time: now - 1,
    },
    tasks: [taskRow],
  });

  const result = await getDiagnosticSessionTasks(5, { userId: 1, guestToken: null }, {
    getConnection: async () => connection,
    nowSec: () => now,
  });
  assert.ok(result.summary);
});

test("rejects a non-positive sessionId", async () => {
  await assert.rejects(
    () =>
      getDiagnosticSessionTasks(0, { userId: 1, guestToken: null }, {
        getConnection: async () => makeConnection({ header: null, tasks: [] }),
      }),
    (error: unknown) =>
      error instanceof GetDiagnosticSessionTasksError &&
      error.code === "invalid_input",
  );
});
