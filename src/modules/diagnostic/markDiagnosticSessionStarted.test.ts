import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { SESSION_STATUS_CREATED } from "@/modules/sessions/types";
import {
  MarkDiagnosticSessionStartedError,
  markDiagnosticSessionStarted,
} from "./markDiagnosticSessionStarted";

function makeConnection(options: {
  session: {
    id: number;
    start_time: number;
    session_status: number;
    expire_time?: number;
  } | null;
}) {
  let updated = false;
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>() => (options.session ? [options.session] : []) as unknown as T[],
    execute: async (sql) => {
      if (sql.includes("UPDATE task_sessions")) {
        updated = true;
        return { insertId: 0, affectedRows: 1 };
      }
      return { insertId: 0, affectedRows: 0 };
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };
  return { connection, wasUpdated: () => updated };
}

const owner = { userId: null, guestToken: "guest-a" };

test("sets start_time once when it is still 0", async () => {
  const mock = makeConnection({
    session: {
      id: 5,
      start_time: 0,
      session_status: SESSION_STATUS_CREATED,
      expire_time: 9_999_999_999,
    },
  });
  const result = await markDiagnosticSessionStarted(
    { owner, sessionId: 5 },
    { getConnection: async () => mock.connection, nowSec: () => 1000 },
  );
  assert.equal(result.startTime, 1000);
  assert.ok(mock.wasUpdated());
});

test("does not overwrite an existing start_time", async () => {
  const mock = makeConnection({
    session: {
      id: 5,
      start_time: 500,
      session_status: SESSION_STATUS_CREATED,
      expire_time: 9_999_999_999,
    },
  });
  const result = await markDiagnosticSessionStarted(
    { owner, sessionId: 5 },
    { getConnection: async () => mock.connection, nowSec: () => 1000 },
  );
  assert.equal(result.startTime, 500);
  assert.equal(mock.wasUpdated(), false);
});

test("guest A cannot mark guest B's session as started (owner mismatch -> not_found)", async () => {
  const mock = makeConnection({ session: null });
  await assert.rejects(
    () => markDiagnosticSessionStarted({ owner, sessionId: 5 }, { getConnection: async () => mock.connection }),
    (error: unknown) =>
      error instanceof MarkDiagnosticSessionStartedError && error.code === "not_found",
  );
});

test("rejects marking started once the session's 24h deadline has passed", async () => {
  const now = 1_700_000_000;
  const mock = makeConnection({
    session: {
      id: 5,
      start_time: 0,
      session_status: SESSION_STATUS_CREATED,
      expire_time: now - 1,
    },
  });
  await assert.rejects(
    () =>
      markDiagnosticSessionStarted(
        { owner, sessionId: 5 },
        { getConnection: async () => mock.connection, nowSec: () => now },
      ),
    (error: unknown) =>
      error instanceof MarkDiagnosticSessionStartedError &&
      error.code === "session_expired",
  );
  assert.equal(mock.wasUpdated(), false);
});
