import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import {
  listRecentLoginEntries,
  openLoginSession,
  resetUserSessionsForTests,
  revokeLoginSession,
  touchLoginSession,
} from "./userSessions";

function mockConnection(options?: {
  insertId?: number;
  touchRows?: number;
}) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const connection: SqlConnection = {
    beginTransaction: async () => undefined,
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
    query: async <T = unknown>(sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes("information_schema")) {
        return [{ COLUMN_NAME: "ip" }] as T[];
      }
      if (sql.includes("FROM user_sessions s")) {
        return [
          {
            id: 7,
            user_id: 3,
            created_at: "2026-10-16T12:00:00.000Z",
            ip: null,
            user_agent: "Browser",
            display_name: "Адмін",
            login: "admin",
          },
        ] as T[];
      }
      return [] as T[];
    },
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("INSERT INTO user_sessions")) {
        return { insertId: options?.insertId ?? 15, affectedRows: 1 };
      }
      if (sql.includes("UPDATE user_sessions") && sql.includes("last_seen_at")) {
        return { insertId: 0, affectedRows: options?.touchRows ?? 1 };
      }
      return { insertId: 0, affectedRows: 1 };
    },
  };
  return { connection, calls };
}

test("openLoginSession stores the client ip and leaves it null when unknown", async () => {
  resetUserSessionsForTests();
  const mock = mockConnection();
  const opened = await openLoginSession(
    4,
    {
      expiresAtSec: 1_700_000_000,
      meta: { ip: "203.0.113.9", userAgent: "NMT" },
    },
    { getConnection: async () => mock.connection },
  );
  assert.equal(opened.id, 15);
  const insert = mock.calls.find((call) =>
    call.sql.includes("INSERT INTO user_sessions"),
  );
  assert.deepEqual(insert?.params, [4, 1_700_000_000, "203.0.113.9", "NMT"]);

  resetUserSessionsForTests();
  const empty = mockConnection({ insertId: 16 });
  await openLoginSession(
    4,
    { expiresAtSec: 1_700_000_100, meta: { ip: null, userAgent: null } },
    { getConnection: async () => empty.connection },
  );
  const second = empty.calls.find((call) =>
    call.sql.includes("INSERT INTO user_sessions"),
  );
  assert.deepEqual(second?.params, [4, 1_700_000_100, null, null]);
});

test("touchLoginSession skips revoked or expired rows and throttles repeats", async () => {
  resetUserSessionsForTests();
  const mock = mockConnection();
  const deps = { getConnection: async () => mock.connection };
  await touchLoginSession(4, 15, deps, 1_000);
  await touchLoginSession(4, 15, deps, 1_000 + 10_000);
  const touches = mock.calls.filter((call) => call.sql.includes("SET last_seen_at"));
  assert.equal(touches.length, 2);
  assert.match(touches[0]!.sql, /revoked_at IS NULL/);
  assert.match(touches[0]!.sql, /expires_at > CURRENT_TIMESTAMP/);
  assert.deepEqual(touches[0]!.params, [15, 4]);
  assert.match(touches[1]!.sql, /UPDATE app_users/);
});

test("touchLoginSession does not refresh app_users when the session row is closed", async () => {
  resetUserSessionsForTests();
  const mock = mockConnection({ touchRows: 0 });
  await touchLoginSession(
    4,
    15,
    { getConnection: async () => mock.connection },
    5_000,
  );
  assert.equal(
    mock.calls.some((call) => call.sql.includes("UPDATE app_users")),
    false,
  );
});

test("revokeLoginSession marks the row revoked", async () => {
  resetUserSessionsForTests();
  const mock = mockConnection();
  await revokeLoginSession(15, 4, { getConnection: async () => mock.connection });
  const revoke = mock.calls.find((call) =>
    call.sql.includes("SET revoked_at = CURRENT_TIMESTAMP"),
  );
  assert.match(revoke?.sql ?? "", /SET revoked_at = CURRENT_TIMESTAMP/);
  assert.deepEqual(revoke?.params, [15, 4]);
});

test("listRecentLoginEntries shows a dash-ready null ip", async () => {
  resetUserSessionsForTests();
  const mock = mockConnection();
  const rows = await listRecentLoginEntries({
    getConnection: async () => mock.connection,
  });
  assert.equal(rows[0]?.ip, null);
  assert.equal(rows[0]?.displayName, "Адмін");
});
