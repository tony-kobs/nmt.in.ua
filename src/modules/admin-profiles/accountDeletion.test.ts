import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import { deleteProfile } from "./store";
import {
  DELETION_GRACE_MS,
  DELETION_REMINDER_MS,
  formatDeletionDate,
  cancelDeletionByToken,
  cancelDeletionOnLogin,
  processDueAccountDeletions,
} from "./accountDeletion";

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
      (handlers.query ? ((await handlers.query(sql, params)) as T[]) : []) as T[],
    execute: async (sql, params) =>
      handlers.execute ? handlers.execute(sql, params) : { insertId: 0, affectedRows: 1 },
  };
}

const student = {
  id: 10,
  login: "pupil1",
  display_name: "Учень",
  email: "pupil1@example.com",
  email_verified_at: "2026-01-01T00:00:00.000Z",
  role: "student" as const,
  is_banned: 0,
  last_login_at: null,
  last_seen_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

test("a banned account is deleted immediately and no letter is sent", async () => {
  const sql: string[] = [];
  let mailed = 0;
  const result = await deleteProfile(
    { actorUserId: 3, targetUserId: 10 },
    {
      getConnection: async () =>
        mockConnection({
          query: async () => [{ ...student, is_banned: 1 }],
          execute: async (statement) => {
            sql.push(statement);
            return { insertId: 0, affectedRows: 1 };
          },
        }),
      sendMail: async () => {
        mailed += 1;
        return { ok: true, mode: "log" };
      },
    },
  );
  assert.equal(result.outcome, "deleted");
  assert.equal(mailed, 0);
  assert.ok(sql.some((statement) => statement.includes("DELETE FROM app_users")));
  assert.equal(sql.some((statement) => statement.includes("deletion_due_at")), false);
});

test("a normal account is scheduled for 14 days and the keep link is mailed", async () => {
  const now = new Date("2026-10-21T12:00:00.000Z");
  const updates: unknown[][] = [];
  let letter = "";
  const result = await deleteProfile(
    { actorUserId: 3, targetUserId: 10 },
    {
      now: () => now,
      getConnection: async () =>
        mockConnection({
          query: async () => [student],
          execute: async (statement, params) => {
            if (statement.includes("deletion_due_at = ?")) updates.push(params ?? []);
            return { insertId: 0, affectedRows: 1 };
          },
        }),
      sendMail: async (input) => {
        letter = `${input.subject}\n${input.text}\n${input.html}`;
        return { ok: true, mode: "log" };
      },
    },
  );
  assert.equal(result.outcome, "scheduled");
  assert.equal(result.mailWarning, false);
  const due = updates[0]?.[1];
  assert.ok(due instanceof Date);
  assert.equal((due as Date).getTime() - now.getTime(), DELETION_GRACE_MS);
  assert.equal(updates[0]?.[2], 3);
  assert.match(letter, /Зберегти акаунт/);
  assert.match(letter, /keep-account\?token=/);
  assert.match(letter, new RegExp(formatDeletionDate(due as Date, "uk").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("a failed warning keeps the schedule and tells the admin", async () => {
  const result = await deleteProfile(
    { actorUserId: 3, targetUserId: 10 },
    {
      now: () => new Date("2026-10-21T12:00:00.000Z"),
      getConnection: async () =>
        mockConnection({
          query: async () => [student],
        }),
      sendMail: async () => ({ ok: false, error: "brevo_error" }),
    },
  );
  assert.equal(result.outcome, "scheduled");
  assert.equal(result.mailWarning, true);
  assert.ok(result.dueAt);
});

test("the keep link cancels the schedule and notifies admins", async () => {
  const notices: number[] = [];
  const cleared: number[] = [];
  const status = await cancelDeletionByToken("once-token", {
    getConnection: async () =>
      mockConnection({
        query: async (sql, params) => {
          if (sql.includes("deletion_cancel_token_hash = ?")) {
            return [{
              id: 10,
              login: "pupil1",
              display_name: "Учень",
              deletion_cancel_token_hash: params?.[0],
            }];
          }
          if (sql.includes("role = 'admin'")) return [{ id: 3 }, { id: 4 }];
          return [];
        },
        execute: async (sql, params) => {
          if (sql.includes("deletion_due_at = NULL")) cleared.push(Number(params?.[0]));
          return { insertId: 0, affectedRows: 1 };
        },
      }),
    notify: async (input) => {
      notices.push(input.userId);
      return { id: 1, created: true };
    },
  });
  assert.equal(status, "kept");
  assert.deepEqual(cleared, [10]);
  assert.deepEqual(notices, [3, 4]);
});

test("an unknown keep link does not clear a schedule", async () => {
  let executed = 0;
  const status = await cancelDeletionByToken("missing", {
    getConnection: async () =>
      mockConnection({
        query: async () => [],
        execute: async () => {
          executed += 1;
          return { insertId: 0, affectedRows: 1 };
        },
      }),
    notify: async () => {
      throw new Error("should not notify");
    },
  });
  assert.equal(status, "invalid");
  assert.equal(executed, 0);
});

test("signing in cancels a scheduled deletion and notifies admins", async () => {
  const notices: string[] = [];
  const cancelled = await cancelDeletionOnLogin(10, {
    getConnection: async () =>
      mockConnection({
        query: async (sql) => {
          if (sql.includes("deletion_due_at IS NOT NULL") && sql.includes("display_name")) {
            return [{ id: 10, login: "pupil1", display_name: "Учень" }];
          }
          if (sql.includes("role = 'admin'")) return [{ id: 3 }];
          return [];
        },
      }),
    notify: async (input) => {
      notices.push(input.kind);
      return { id: 1, created: true };
    },
  });
  assert.equal(cancelled, true);
  assert.deepEqual(notices, ["admin.account_kept"]);
});

test("due processing deletes an overdue account and reminds one inside three days", async () => {
  const now = new Date("2026-11-04T12:00:00.000Z");
  const deleted: number[] = [];
  const reminded: string[] = [];
  const result = await processDueAccountDeletions({
    now,
    getConnection: async () =>
      mockConnection({
        query: async (sql) => {
          if (sql.includes("display_name")) {
            return [
              {
                id: 10,
                login: "late",
                display_name: "Пізно",
                email: "late@example.com",
                role: "student",
                is_banned: 0,
                deletion_due_at: new Date(now.getTime() - 60_000),
                deletion_reminder_sent_at: null,
              },
              {
                id: 11,
                login: "soon",
                display_name: "Скоро",
                email: "soon@example.com",
                role: "student",
                is_banned: 0,
                deletion_due_at: new Date(now.getTime() + DELETION_REMINDER_MS - 60_000),
                deletion_reminder_sent_at: null,
              },
              {
                id: 12,
                login: "later",
                display_name: "Пізніше",
                email: "later@example.com",
                role: "student",
                is_banned: 0,
                deletion_due_at: new Date(now.getTime() + DELETION_GRACE_MS),
                deletion_reminder_sent_at: null,
              },
            ];
          }
          if (sql.includes("FOR UPDATE")) return [{ id: 10 }];
          return [];
        },
        execute: async (sql, params) => {
          if (sql.includes("DELETE FROM app_users")) deleted.push(Number(params?.[0]));
          return { insertId: 0, affectedRows: 1 };
        },
      }),
    sendMail: async (input) => {
      reminded.push(input.to);
      return { ok: true, mode: "log" };
    },
  });
  assert.deepEqual(deleted, [10]);
  assert.deepEqual(reminded, ["soon@example.com"]);
  assert.deepEqual(result, { deleted: 1, reminded: 1 });
});
