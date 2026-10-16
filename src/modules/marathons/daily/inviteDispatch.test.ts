import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { dispatchMarathonInvites } from "./inviteDispatch";

type UserRow = {
  id: number;
  role: string;
  email: string | null;
  is_banned: number;
};

type PrefRow = {
  user_id: number;
  category: string;
  email_on: number;
  telegram_on: number;
};

function harness(audience: "none" | "students" | "all") {
  const users: UserRow[] = [
    { id: 1, role: "student", email: "student@example.com", is_banned: 0 },
    { id: 2, role: "teacher", email: "teacher@example.com", is_banned: 0 },
    { id: 3, role: "student", email: "off@example.com", is_banned: 0 },
    { id: 4, role: "student", email: "declined@example.com", is_banned: 0 },
    { id: 5, role: "admin", email: "admin@example.com", is_banned: 0 },
    { id: 6, role: "student", email: "mail@example.com", is_banned: 0 },
    { id: 7, role: "student", email: "banned@example.com", is_banned: 1 },
  ];
  const prefs: PrefRow[] = [
    { user_id: 1, category: "marathon", email_on: 1, telegram_on: 1 },
    { user_id: 3, category: "marathon", email_on: 0, telegram_on: 0 },
    { user_id: 2, category: "marathon", email_on: 1, telegram_on: 0 },
    { user_id: 5, category: "marathon", email_on: 1, telegram_on: 1 },
  ];
  const declines = new Set([4]);
  const chats = new Map<number, string>([[1, "555"]]);
  const dispatches: Array<{ marathonId: number; audience: string }> = [];
  const recipients: number[] = [];
  const emails: string[] = [];
  const telegrams: string[] = [];
  const notes: number[] = [];
  const marathon = {
    id: 9,
    slug: "math-5",
    title: "П'ять днів",
    invite_audience: audience,
    status: "active",
  };
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async <T>(sql: string) => {
      if (sql.includes("FROM marathons") && sql.includes("invite_audience")) return [marathon] as T[];
      if (sql.includes("FROM app_users")) return users as T[];
      if (sql.includes("FROM marathon_declines")) {
        return [...declines].map((user_id) => ({ user_id })) as T[];
      }
      if (sql.includes("FROM user_channel_preferences")) return prefs as T[];
      if (sql.includes("FROM user_telegram_accounts")) {
        return [...chats].map(([user_id, telegram_chat_id]) => ({ user_id, telegram_chat_id })) as T[];
      }
      if (sql.includes("FROM marathon_participants")) return [] as T[];
      return [] as T[];
    },
    execute: async (sql: string, params: unknown[] = []) => {
      if (sql.includes("INSERT IGNORE INTO marathon_invite_dispatches")) {
        const marathonId = Number(params[0]);
        if (dispatches.some((row) => row.marathonId === marathonId)) {
          return { insertId: 0, affectedRows: 0 };
        }
        dispatches.push({ marathonId, audience: String(params[1]) });
        return { insertId: 1, affectedRows: 1 };
      }
      if (sql.includes("INSERT IGNORE INTO marathon_invite_recipients")) {
        recipients.push(Number(params[1]));
        return { insertId: 0, affectedRows: 1 };
      }
      return { insertId: 1, affectedRows: 1 };
    },
  };
  return {
    getConnection: async () => connection,
    emails,
    telegrams,
    notes,
    recipients,
    dispatches,
    notify: async (input: { userId: number }) => {
      notes.push(input.userId);
      return { id: input.userId, created: true };
    },
    sendEmail: async (input: { to: string }) => {
      emails.push(input.to);
      return true;
    },
    sendTelegram: async (chatId: string) => {
      telegrams.push(chatId);
      return true;
    },
  };
}

test("activation invites the chosen audience once and skips declines and a closed marathon category", async () => {
  const db = harness("students");
  const first = await dispatchMarathonInvites(9, db);
  assert.equal(first.claimed, true);
  assert.deepEqual(first.recipients, 2);
  assert.deepEqual(db.notes.sort((a, b) => a - b), [1, 6]);
  assert.deepEqual(db.emails.sort(), ["mail@example.com", "student@example.com"]);
  assert.deepEqual(db.telegrams, ["555"]);
  assert.deepEqual(db.recipients.sort((a, b) => a - b), [1, 6]);
  assert.equal(db.notes.includes(2), false);
  assert.equal(db.notes.includes(3), false);
  assert.equal(db.notes.includes(4), false);
  assert.equal(db.notes.includes(5), false);

  const again = await dispatchMarathonInvites(9, db);
  assert.deepEqual(again, { claimed: false, recipients: 0 });
  assert.equal(db.emails.length, 2);
  assert.equal(db.telegrams.length, 1);
  assert.equal(db.notes.length, 2);
});

test("«everyone» includes teachers and admins, still once", async () => {
  const db = harness("all");
  const first = await dispatchMarathonInvites(9, db);
  assert.equal(first.claimed, true);
  assert.deepEqual(db.notes.sort((a, b) => a - b), [1, 2, 5, 6]);
  const again = await dispatchMarathonInvites(9, db);
  assert.equal(again.claimed, false);
  assert.equal(db.notes.length, 4);
});

test("«nobody» claims the lock and sends nothing, including on a later activation", async () => {
  const db = harness("none");
  const first = await dispatchMarathonInvites(9, db);
  assert.deepEqual(first, { claimed: true, recipients: 0 });
  assert.deepEqual(db.notes, []);
  assert.deepEqual(db.emails, []);
  assert.equal(db.dispatches.length, 1);
  const again = await dispatchMarathonInvites(9, db);
  assert.deepEqual(again, { claimed: false, recipients: 0 });
  assert.equal(db.dispatches.length, 1);
});
