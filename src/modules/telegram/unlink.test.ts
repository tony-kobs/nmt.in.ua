import assert from "node:assert/strict";
import { test } from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { repairUserTelegramLink } from "./linkSync";
import { UNLINK_NOTICE, UNLINK_REASON, unlinkTelegramAccount } from "./unlink";
import { unlinkTelegramForCurrentUser } from "./unlinkForCurrentUser";

type Account = { user_id: number; telegram_user_id: string; telegram_chat_id: string };
type Participant = { user_id: number; telegram_chat_id: string | null; score: number };
type Token = { user_id: number; consumed_at: Date | null };
type Outbox = { id: number; chat_id: string; status: string; error_text: string | null };
type Job = { user_id: number; channel: string; status: string; error_text: string | null };

function fakeDatabase() {
  const accounts: Account[] = [];
  const participants: Participant[] = [];
  const tokens: Token[] = [];
  const botLinks: Token[] = [];
  const outbox: Outbox[] = [];
  const jobs: Job[] = [];
  const sqlLog: string[] = [];
  let failOutbox = false;
  let snapshot: {
    accounts: Account[];
    participants: Participant[];
    tokens: Token[];
    botLinks: Token[];
    outbox: Outbox[];
    jobs: Job[];
  } | null = null;
  const connection: SqlConnection = {
    beginTransaction: async () => {
      snapshot = {
        accounts: structuredClone(accounts),
        participants: structuredClone(participants),
        tokens: structuredClone(tokens),
        botLinks: structuredClone(botLinks),
        outbox: structuredClone(outbox),
        jobs: structuredClone(jobs),
      };
    },
    commit: async () => { snapshot = null; },
    rollback: async () => {
      if (!snapshot) return;
      accounts.splice(0, accounts.length, ...snapshot.accounts);
      participants.splice(0, participants.length, ...snapshot.participants);
      tokens.splice(0, tokens.length, ...snapshot.tokens);
      botLinks.splice(0, botLinks.length, ...snapshot.botLinks);
      outbox.splice(0, outbox.length, ...snapshot.outbox);
      jobs.splice(0, jobs.length, ...snapshot.jobs);
      snapshot = null;
    },
    release: () => {},
    query: async <T>(sql: string, params: unknown[] = []) => {
      sqlLog.push(sql);
      if (sql.includes("marathon_day_progress")) throw new Error("progress must stay");
      if (sql.includes("FROM app_users")) {
        return (params[0] === 7 ? [{ id: 7 }] : []) as T[];
      }
      if (sql.includes("FROM user_telegram_accounts")) {
        return accounts.filter((row) => row.user_id === params[0]) as T[];
      }
      if (sql.includes("FROM marathon_participants")) {
        return participants.filter((row) =>
          row.user_id === params[0] && row.telegram_chat_id != null,
        ) as T[];
      }
      return [] as T[];
    },
    execute: async (sql: string, params: unknown[] = []) => {
      sqlLog.push(sql);
      if (sql.includes("marathon_day_progress") || /DELETE FROM marathon_participants/i.test(sql)) {
        throw new Error("scores must stay");
      }
      if (sql.startsWith("DELETE FROM user_telegram_accounts")) {
        const before = accounts.length;
        for (let i = accounts.length - 1; i >= 0; i -= 1) {
          if (accounts[i].user_id === params[0]) accounts.splice(i, 1);
        }
        return { insertId: 0, affectedRows: before - accounts.length };
      }
      if (sql.startsWith("UPDATE marathon_participants SET telegram_chat_id = NULL")) {
        for (const row of participants) {
          if (row.user_id === params[0]) row.telegram_chat_id = null;
        }
      }
      if (sql.startsWith("UPDATE telegram_link_tokens")) {
        for (const row of tokens) {
          if (row.user_id === params[0] && !row.consumed_at) row.consumed_at = new Date();
        }
      }
      if (sql.startsWith("UPDATE marathon_bot_links")) {
        for (const row of botLinks) {
          if (row.user_id === params[0] && !row.consumed_at) row.consumed_at = new Date();
        }
      }
      if (sql.includes("UPDATE marathon_telegram_outbox")) {
        if (failOutbox) throw new Error("outbox write failed");
        const reason = sql.includes("error_text") ? String(params[0]) : null;
        const chats = new Set((sql.includes("error_text") ? params.slice(1) : params).map(String));
        for (const row of outbox) {
          if (row.status === "pending" && chats.has(row.chat_id)) {
            row.status = "cancelled";
            if (reason) row.error_text = reason;
          }
        }
      }
      if (sql.includes("UPDATE marathon_message_jobs")) {
        const reason = sql.includes("error_text") ? String(params[0]) : null;
        const userId = sql.includes("error_text") ? params[1] : params[0];
        for (const row of jobs) {
          if (row.user_id === userId && row.channel === "telegram" && (row.status === "queued" || row.status === "sending")) {
            row.status = "cancelled";
            if (reason) row.error_text = reason;
          }
        }
      }
      return { insertId: 0, affectedRows: 1 };
    },
  };
  return {
    accounts,
    participants,
    tokens,
    botLinks,
    outbox,
    jobs,
    sqlLog,
    connection,
    getConnection: async () => connection,
    failOutbox: () => { failOutbox = true; },
  };
}

test("unlink clears both stores, tokens and pending telegram sends, and keeps scores", async () => {
  const db = fakeDatabase();
  db.accounts.push({ user_id: 7, telegram_user_id: "4242", telegram_chat_id: "4242" });
  db.participants.push({ user_id: 7, telegram_chat_id: "4242", score: 8 });
  db.participants.push({ user_id: 8, telegram_chat_id: "999", score: 1 });
  db.tokens.push({ user_id: 7, consumed_at: null }, { user_id: 7, consumed_at: new Date("2026-01-01") });
  db.botLinks.push({ user_id: 7, consumed_at: null });
  db.outbox.push(
    { id: 1, chat_id: "4242", status: "pending", error_text: null },
    { id: 2, chat_id: "4242", status: "sent", error_text: null },
    { id: 3, chat_id: "999", status: "pending", error_text: null },
  );
  db.jobs.push(
    { user_id: 7, channel: "telegram", status: "queued", error_text: null },
    { user_id: 7, channel: "email", status: "queued", error_text: null },
    { user_id: 7, channel: "telegram", status: "sent", error_text: null },
  );
  const notices: string[] = [];
  const result = await unlinkTelegramAccount(7, {
    getConnection: db.getConnection,
    notify: async (chatId, text) => { notices.push(`${chatId}:${text}`); },
  });
  assert.equal(result.unlinked, true);
  assert.deepEqual(result.chatIds, ["4242"]);
  assert.deepEqual(notices, [`4242:${UNLINK_NOTICE}`]);
  assert.equal(db.accounts.length, 0);
  assert.equal(db.participants[0].telegram_chat_id, null);
  assert.equal(db.participants[0].score, 8);
  assert.equal(db.participants[1].telegram_chat_id, "999");
  assert.ok(db.tokens.every((row) => row.consumed_at));
  assert.ok(db.botLinks[0].consumed_at);
  assert.equal(db.outbox[0].status, "cancelled");
  assert.equal(db.outbox[0].error_text, UNLINK_REASON);
  assert.equal(db.outbox[1].status, "sent");
  assert.equal(db.outbox[2].status, "pending");
  assert.equal(db.jobs[0].status, "cancelled");
  assert.equal(db.jobs[0].error_text, UNLINK_REASON);
  assert.equal(db.jobs[1].status, "queued");
  assert.equal(db.jobs[2].status, "sent");
  assert.equal(db.sqlLog.some((sql) => sql.includes("marathon_day_progress")), false);
  await repairUserTelegramLink(db.connection, 7);
  assert.equal(db.accounts.length, 0);
  const again = await unlinkTelegramAccount(7, {
    getConnection: db.getConnection,
    notify: async () => { throw new Error("should not notify"); },
  });
  assert.equal(again.unlinked, false);
  assert.deepEqual(again.chatIds, []);
});

test("a failed notice does not undo the unlink", async () => {
  const db = fakeDatabase();
  db.accounts.push({ user_id: 7, telegram_user_id: "15", telegram_chat_id: "15" });
  const result = await unlinkTelegramAccount(7, {
    getConnection: db.getConnection,
    notify: async () => { throw new Error("telegram down"); },
  });
  assert.equal(result.unlinked, true);
  assert.equal(db.accounts.length, 0);
});

test("a failed outbox write rolls back the account delete", async () => {
  const db = fakeDatabase();
  db.accounts.push({ user_id: 7, telegram_user_id: "15", telegram_chat_id: "15" });
  db.failOutbox();
  await assert.rejects(() => unlinkTelegramAccount(7, { getConnection: db.getConnection, notify: async () => {} }));
  assert.equal(db.accounts.length, 1);
});

test("the account action unlinks only the signed-in user", async () => {
  let seen = 0;
  const paths: string[] = [];
  const result = await unlinkTelegramForCurrentUser({
    requireUser: async () => ({ id: 7, role: "student", login: "pupil", displayName: "Учень" }),
    unlink: async (userId) => {
      seen = userId;
      return { unlinked: true, chatIds: ["15"] };
    },
    revalidatePath: (path) => { paths.push(path); },
  });
  assert.deepEqual(result, { status: "success" });
  assert.equal(seen, 7);
  assert.ok(paths.includes("/account"));
});
