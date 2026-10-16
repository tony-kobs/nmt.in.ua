import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import { AdminProfilesError } from "./types";
import { deleteProfile, promotePlatformStudent, setProfileBanned } from "./store";

function mockConnection(handlers: {
  query?: (sql: string, params?: unknown[]) => Promise<unknown[]>;
  execute?: (
    sql: string,
    params?: unknown[],
  ) => Promise<{ insertId: number; affectedRows: number }>;
}): SqlConnection {
  return {
    beginTransaction: async () => undefined,
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
    query: async <T = unknown>(sql: string, params?: unknown[]) =>
      (handlers.query
        ? ((await handlers.query(sql, params)) as T[])
        : []) as T[],
    execute: async (sql, params) =>
      handlers.execute
        ? handlers.execute(sql, params)
        : { insertId: 0, affectedRows: 1 },
  };
}

const studentRow = {
  id: 10,
  login: "pupil1",
  display_name: "Учень",
  email: "pupil1@example.com",
  email_verified_at: "2026-01-01T00:00:00.000Z",
  role: "student" as const,
  is_banned: 0,
  last_login_at: "2026-01-01T00:00:00.000Z",
  last_seen_at: "2026-01-01T00:00:00.000Z",
  created_at: "2026-01-01T00:00:00.000Z",
};

test("setProfileBanned stays offline when only last_seen looks fresh", async () => {
  const profile = await setProfileBanned(
    { actorUserId: 3, targetUserId: 10, banned: false },
    {
      getConnection: async () =>
        mockConnection({
          query: async () => [
            {
              ...studentRow,
              is_online: 0,
              seen_minutes_ago: 180,
              last_seen_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
            },
          ],
        }),
    },
  );
  assert.equal(profile.isOnline, false);
  assert.equal(profile.seenMinutesAgo, 180);
  assert.equal(profile.isBanned, false);
});

test("setProfileBanned marks online only from the live-session flag", async () => {
  const profile = await setProfileBanned(
    { actorUserId: 3, targetUserId: 10, banned: false },
    {
      getConnection: async () =>
        mockConnection({
          query: async () => [
            {
              ...studentRow,
              is_online: 1,
              seen_minutes_ago: 1,
            },
          ],
        }),
    },
  );
  assert.equal(profile.isOnline, true);
  assert.equal(profile.seenMinutesAgo, 1);
});

test("setProfileBanned blocks self-action", async () => {
  await assert.rejects(
    () =>
      setProfileBanned(
        { actorUserId: 10, targetUserId: 10, banned: true },
        {
          getConnection: async () =>
            mockConnection({
              query: async () => [studentRow],
            }),
        },
      ),
    (error: unknown) =>
      error instanceof AdminProfilesError && error.code === "self_action",
  );
});

test("setProfileBanned revokes login sessions only when the ban starts", async () => {
  const executed: string[] = [];
  let began = 0;
  let committed = 0;
  const connection = mockConnection({
    query: async () => [studentRow],
    execute: async (sql) => {
      executed.push(sql);
      return { insertId: 0, affectedRows: 1 };
    },
  });
  connection.beginTransaction = async () => {
    began += 1;
  };
  connection.commit = async () => {
    committed += 1;
  };
  await setProfileBanned(
    { actorUserId: 3, targetUserId: 10, banned: true },
    { getConnection: async () => connection },
  );
  const revokes = executed.filter((sql) => sql.includes("UPDATE user_sessions"));
  assert.equal(revokes.length, 1);
  assert.match(revokes[0] ?? "", /revoked_at/);
  assert.equal(began, 1);
  assert.equal(committed, 1);
});

test("setProfileBanned does not revoke sessions when lifting a ban", async () => {
  const executed: string[] = [];
  await setProfileBanned(
    { actorUserId: 3, targetUserId: 10, banned: false },
    {
      getConnection: async () =>
        mockConnection({
          query: async () => [{ ...studentRow, is_banned: 1 }],
          execute: async (sql) => {
            executed.push(sql);
            return { insertId: 0, affectedRows: 1 };
          },
        }),
    },
  );
  assert.equal(
    executed.some((sql) => sql.includes("UPDATE user_sessions")),
    false,
  );
});

test("setProfileBanned bans a regular student", async () => {
  const profile = await setProfileBanned(
    { actorUserId: 3, targetUserId: 10, banned: true },
    {
      getConnection: async () =>
        mockConnection({
          query: async () => [studentRow],
        }),
    },
  );
  assert.equal(profile.isBanned, true);
  assert.equal(profile.login, "pupil1");
});

test("promotePlatformStudent opens a marathon-only student", async () => {
  let sql = "";
  const profile = await promotePlatformStudent(
    { actorUserId: 3, targetUserId: 10 },
    {
      getConnection: async () =>
        mockConnection({
          query: async () => [{ ...studentRow, cabinet_scope: "marathon" }],
          execute: async (statement) => {
            sql = statement;
            return { insertId: 0, affectedRows: 1 };
          },
        }),
    },
  );
  assert.equal(profile.cabinetScope, "full");
  assert.match(sql, /cabinet_scope = 'full'/);
});

test("promotePlatformStudent rejects a platform student", async () => {
  await assert.rejects(
    () =>
      promotePlatformStudent(
        { actorUserId: 3, targetUserId: 10 },
        {
          getConnection: async () =>
            mockConnection({
              query: async () => [studentRow],
            }),
        },
      ),
    (error: unknown) =>
      error instanceof AdminProfilesError && error.code === "invalid_input",
  );
});

test("deleteProfile blocks the last active admin", async () => {
  await assert.rejects(
    () =>
      deleteProfile(
        { actorUserId: 99, targetUserId: 3 },
        {
          getConnection: async () =>
            mockConnection({
              query: async (sql) => {
                if (sql.includes("COUNT")) return [{ count: 1 }];
                return [
                  {
                    id: 3,
                    login: "other-admin",
                    display_name: "Адмін 2",
                    role: "admin",
                    is_banned: 0,
                    last_login_at: null,
                    last_seen_at: null,
                    created_at: "2026-01-01T00:00:00.000Z",
                  },
                ];
              },
            }),
        },
      ),
    (error: unknown) =>
      error instanceof AdminProfilesError && error.code === "last_admin",
  );
});
