import assert from "node:assert/strict";
import { test } from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { consumeTelegramLink, createTelegramLink, getTelegramLink, getTelegramLinkRecord, getTelegramLinkStatus, hashTelegramLinkToken, mintTelegramLinkToken } from "./link";

const now = new Date("2026-01-01T12:00:00.000Z");

function fakeDatabase() {
  const tokens: Array<{ id: number; user_id: number; token_hash: string; expires_at: Date; consumed_at: Date | null }> = [];
  const accounts: Array<{ user_id: number; telegram_user_id: string }> = [];
  const writes: Array<{ sql: string; params: unknown[] }> = [];
  let snapshot: { tokens: typeof tokens; accounts: typeof accounts } | null = null;
  let commits = 0;
  let rollbacks = 0;
  let failConsumption = false;
  const connection: SqlConnection = {
    beginTransaction: async () => { snapshot = { tokens: structuredClone(tokens), accounts: structuredClone(accounts) }; },
    commit: async () => { snapshot = null; commits++; },
    rollback: async () => {
      if (snapshot) {
        tokens.splice(0, tokens.length, ...snapshot.tokens);
        accounts.splice(0, accounts.length, ...snapshot.accounts);
      }
      snapshot = null;
      rollbacks++;
    },
    release: () => {},
    query: async <T>(sql: string, params: unknown[] = []) => {
      if (sql.includes("FROM app_users WHERE")) return [{ id: 7, is_banned: 0 }] as T[];
      if (sql.includes("FROM telegram_link_tokens WHERE token_hash")) return tokens.filter((item) => item.token_hash === params[0]) as T[];
      if (sql.includes("FROM user_telegram_accounts")) {
        return accounts.filter((item) => item.user_id === params[0] || item.telegram_user_id === params[1]) as T[];
      }
      return [];
    },
    execute: async (sql: string, params: unknown[] = []) => {
      writes.push({ sql, params });
      if (sql.startsWith("INSERT INTO telegram_link_tokens")) {
        tokens.push({ id: tokens.length + 1, user_id: params[0] as number, token_hash: params[1] as string, expires_at: params[2] as Date, consumed_at: null });
      }
      if (sql.startsWith("UPDATE telegram_link_tokens SET consumed_at") && sql.includes("user_id")) {
        for (const token of tokens) if (token.user_id === params[0] && !token.consumed_at) token.consumed_at = now;
      }
      if (sql.startsWith("INSERT INTO user_telegram_accounts") && sql.includes("VALUES")) {
        if (accounts.some((item) => item.user_id === params[0] || item.telegram_user_id === params[1])) {
          throw Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" });
        }
        accounts.push({ user_id: params[0] as number, telegram_user_id: params[1] as string });
      }
      if (sql.startsWith("UPDATE telegram_link_tokens SET consumed_at") && sql.includes("WHERE id")) {
        if (failConsumption) throw new Error("write failed");
        const token = tokens.find((item) => item.id === params[0]);
        if (token) token.consumed_at = now;
      }
      return { insertId: 1, affectedRows: 1 };
    },
  };
  return { tokens, accounts, writes, connection, getConnection: async () => connection, get commits() { return commits; }, get rollbacks() { return rollbacks; }, failConsumption: () => { failConsumption = true; } };
}

test("link tokens are random, hashed in storage, and expire in ten minutes", async () => {
  const db = fakeDatabase();
  assert.notEqual(mintTelegramLinkToken(), mintTelegramLinkToken());
  const url = await createTelegramLink(7, "example_bot", { getConnection: db.getConnection, now: () => now });
  const raw = new URL(url).searchParams.get("start")!;
  assert.match(raw, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(db.tokens[0].token_hash, hashTelegramLinkToken(raw));
  assert.equal(db.tokens[0].expires_at.getTime(), now.getTime() + 600_000);
  assert.equal(db.writes.some((write) => write.params.includes(raw)), false);
  assert.equal(await getTelegramLinkStatus(7, db), false);
});

test("valid token links once; invalid, expired, and duplicate identities fail", async () => {
  const db = fakeDatabase();
  const deps = { getConnection: db.getConnection, now: () => now };
  const identity = { userId: "12345", chatId: "12345" };
  const url = await createTelegramLink(7, "example_bot", deps);
  const raw = new URL(url).searchParams.get("start")!;
  assert.equal(await consumeTelegramLink("invalid", identity, deps), false);
  assert.equal(await consumeTelegramLink(raw, identity, deps), true);
  assert.equal(await getTelegramLinkStatus(7, db), true);
  assert.equal(await consumeTelegramLink(raw, identity, deps), false);
  assert.equal(db.accounts.length, 1);
  const other = fakeDatabase();
  const otherUrl = await createTelegramLink(7, "example_bot", { getConnection: other.getConnection, now: () => now });
  const otherRaw = new URL(otherUrl).searchParams.get("start")!;
  assert.equal(await consumeTelegramLink(otherRaw, identity, { getConnection: other.getConnection, now: () => new Date(now.getTime() + 600_001) }), false);
  assert.equal(other.accounts.length, 0);
  other.tokens[0].expires_at = new Date(NaN);
  assert.equal(await consumeTelegramLink(otherRaw, identity, { getConnection: other.getConnection, now: () => now }), false);
  const duplicate = fakeDatabase();
  const duplicateUrl = await createTelegramLink(7, "example_bot", { getConnection: duplicate.getConnection, now: () => now });
  duplicate.accounts.push({ user_id: 8, telegram_user_id: identity.userId });
  assert.equal(await consumeTelegramLink(new URL(duplicateUrl).searchParams.get("start")!, identity, { getConnection: duplicate.getConnection, now: () => now }), false);
});

test("failed token consumption rolls back the inserted account", async () => {
  const db = fakeDatabase();
  const deps = { getConnection: db.getConnection, now: () => now };
  const url = await createTelegramLink(7, "example_bot", deps);
  db.failConsumption();
  await assert.rejects(() => consumeTelegramLink(new URL(url).searchParams.get("start")!, { userId: "12345", chatId: "12345" }, deps));
  assert.equal(db.accounts.length, 0);
  assert.equal(db.tokens[0].consumed_at, null);
  assert.equal(db.commits, 1);
  assert.equal(db.rollbacks, 1);
});

test("a linked telegram account exposes the chat id and username", async () => {
  const row = { telegram_chat_id: 4242, telegram_username: "@pupil_name" };
  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async <T>(sql: string) => (sql.includes("telegram_username") ? [row] as T[] : []),
    execute: async () => ({ insertId: 1, affectedRows: 1 }),
  };
  assert.deepEqual(
    await getTelegramLinkRecord(7, { getConnection: async () => connection }),
    { chatId: "4242", username: "pupil_name" },
  );
  assert.equal(
    await getTelegramLinkRecord(7, {
      getConnection: async () => ({ ...connection, query: async () => [] }),
    }),
    null,
  );
  assert.equal(await getTelegramLinkRecord(0, { getConnection: async () => connection }), null);
});

test("a marathon chat without an account becomes the same link, and a taken chat is not stolen", async () => {
  const accounts: Array<{ user_id: number; telegram_user_id: string; telegram_chat_id: string }> = [];
  const participants = [{ user_id: 7, telegram_chat_id: 9001 }];
  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async <T>(sql: string, params: unknown[] = []) => {
      if (sql.includes("FROM user_telegram_accounts")) {
        return accounts.filter((item) =>
          item.user_id === params[0] || String(item.telegram_user_id) === String(params[1]),
        ) as T[];
      }
      if (sql.includes("FROM marathon_participants")) {
        return participants.filter((item) => item.user_id === params[0]) as T[];
      }
      return [] as T[];
    },
    execute: async (sql: string, params: unknown[] = []) => {
      if (sql.includes("FROM DUAL") && sql.includes("user_telegram_accounts")) {
        const userId = Number(params[0]);
        const chatId = String(params[1]);
        const taken = accounts.some(
          (item) => item.user_id === userId || item.telegram_user_id === chatId,
        );
        if (!taken) {
          accounts.push({ user_id: userId, telegram_user_id: chatId, telegram_chat_id: chatId });
        }
        return { insertId: 1, affectedRows: taken ? 0 : 1 };
      }
      return { insertId: 1, affectedRows: 1 };
    },
  };
  const deps = { getConnection: async () => connection };
  const first = await getTelegramLink(7, deps);
  assert.equal(first.linked, true);
  assert.equal(first.chatId, "9001");
  assert.equal(accounts.length, 1);
  const second = await getTelegramLink(7, deps);
  assert.equal(second.chatId, "9001");
  assert.equal(accounts.length, 1);

  accounts.splice(0, accounts.length, {
    user_id: 8,
    telegram_user_id: "9001",
    telegram_chat_id: "9001",
  });
  const collided = await getTelegramLink(7, deps);
  assert.equal(collided.linked, true);
  assert.equal(collided.chatId, "9001");
  assert.equal(accounts.some((item) => item.user_id === 7), false);
});
