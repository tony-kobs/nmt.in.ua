import { test } from "node:test";
import assert from "node:assert/strict";
import type { SqlConnection } from "@/lib/db/mysql";
import { getLearningSessions } from "./getLearningSessions";
import { SESSION_STATUS_COMPLETED, SESSION_STATUS_CREATED } from "./types";

type Row = {
  id: number;
  theme_id: number;
  theme_name: string;
  tasks_number: number;
  right_number: number;
  time: number;
  session_status: number;
  session_type: number;
  start_time: number;
};

function makeConnection(rows: Row[]) {
  const calls: { sql: string; params: unknown[] }[] = [];
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

test("getLearningSessions filters by the requesting user's id", async () => {
  const { connection, calls } = makeConnection([]);

  await getLearningSessions(42, { getConnection: async () => connection });

  assert.equal(calls.length, 1);
  assert.match(calls[0]!.sql, /WHERE ts\.user_id = \?/);
  assert.match(calls[0]!.sql, /LIMIT 50\b/);
  assert.deepEqual(calls[0]!.params, [42]);
});

test("getLearningSessions resolves the theme name via the themes join on task_sessions.theme_id", async () => {
  const { connection } = makeConnection([]);
  const calls: { sql: string }[] = [];
  const spyConnection: SqlConnection = {
    ...connection,
    query: async <T,>(sql: string) => {
      calls.push({ sql });
      return [] as unknown as T[];
    },
  };

  await getLearningSessions(1, { getConnection: async () => spyConnection });

  assert.match(calls[0]!.sql, /INNER JOIN themes t ON t\.id = ts\.theme_id/);
  assert.match(calls[0]!.sql, /t\.name AS theme_name/);
});

test("getLearningSessions releases the connection", async () => {
  const { connection, isReleased } = makeConnection([]);

  await getLearningSessions(1, { getConnection: async () => connection });

  assert.equal(isReleased(), true);
});

test("a completed topic test is visible with its stored percent and elapsed time", async () => {
  const { connection } = makeConnection([
    {
      id: 7,
      theme_id: 3,
      theme_name: "Функції",
      tasks_number: 10,
      right_number: 9,
      time: 120,
      session_status: SESSION_STATUS_COMPLETED,
      session_type: 1,
      start_time: 1_700_000_000,
    },
  ]);

  const [row] = await getLearningSessions(1, {
    getConnection: async () => connection,
  });

  assert.equal(row?.status, "completed");
  assert.equal(row?.statusLabel, "Виконано");
  assert.equal(row?.themeName, "Функції");
  assert.equal(row?.percent, 90);
  assert.equal(row?.timeSec, 120);
});

test("an unfinished topic test is listed as planned with a start/continue link target", async () => {
  const { connection } = makeConnection([
    {
      id: 8,
      theme_id: 3,
      theme_name: "Функції",
      tasks_number: 10,
      right_number: 0,
      time: 0,
      session_status: SESSION_STATUS_CREATED,
      session_type: 1,
      start_time: 0,
    },
  ]);

  const [row] = await getLearningSessions(1, {
    getConnection: async () => connection,
  });

  assert.equal(row?.status, "planned");
  assert.equal(row?.statusLabel, "Заплановано");
  assert.equal(row?.id, 8);
});
