import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import type { SqlConnection } from "@/lib/db/mysql";
import type { AuthUser } from "@/modules/auth/types";
import { createParentInvite } from "./createParentInvite";
import { localConfig, readLocalConfig, target, verifyServer } from "../../../test/parentLocalMysql";

// Explicit opt-in only. `check` performs SELECTs and closes, without any writes.
const mode = process.env.NMT_PARENT_INVITE_INTEGRATION;
test("integration guard rejects remote targets and unexpected server identities", () => {
  const env = { ...target, DB_PASSWORD: "not-a-real-password" };
  localConfig(env, {});
  for (const key of Object.keys(target)) {
    assert.throws(() => localConfig({ ...env, [key]: "other" }, {}), /refused/);
    assert.throws(() => localConfig(env, { [key]: "other" }), /refused/);
  }
  const row = { db: "nmt_local", account: "nmt_dev@localhost", host: "test-machine", port: 3306 };
  verifyServer(row, "test-machine.local");
  for (const patch of [{ db: "production" }, { account: "root@localhost" },
    { account: "nmt_dev@%" }, { host: "remote-machine" }, { port: 3307 }]) {
    assert.throws(() => verifyServer({ ...row, ...patch }, "test-machine"), /refused/);
  }
});

test("parent invite on guarded local MySQL; own fixtures only, always cleaned up", {
  skip: mode !== "1" && mode !== "check",
}, async (t) => {
  // Never use Next env loading, the application pool, migrations or schema ensures.
  const config = readLocalConfig();
  let connection: Awaited<ReturnType<typeof mysql.createConnection>>;
  try { connection = await mysql.createConnection(config); }
  catch { throw new Error("Local integration connection failed; credentials and driver details withheld."); }
  const ids: number[] = [];
  const prefix = `pi-it-${randomBytes(8).toString("hex")}`;
  let verified = false;
  try {
    const [identity] = await connection.query<RowDataPacket[]>(
      "SELECT DATABASE() AS db, CURRENT_USER() AS account, @@hostname AS host, @@port AS port",
    );
    verifyServer(identity[0]);
    verified = true;
    t.diagnostic("Verified local database, authenticated account, server hostname and port.");
    await connection.query("SELECT student_user_id, created_by_user_id, token_hash, expires_at, created_at FROM parent_invites LIMIT 0");
    if (mode === "check") {
      t.diagnostic("Preflight complete: no writes performed.");
      return;
    }

    const users: AuthUser[] = [];
    await connection.beginTransaction();
    for (const role of ["student", "teacher", "parent", "admin", "dev"] as const) {
      const login = `${prefix}-${role}`;
      // Invalid password hash intentionally prevents fixture accounts from signing in.
      const [insert] = await connection.execute<ResultSetHeader>(
        "INSERT INTO app_users (login, password_hash, display_name, role) VALUES (?, ?, ?, ?)",
        [login, "integration-disabled", "Parent invite integration fixture", role],
      );
      ids.push(insert.insertId);
      users.push({ id: insert.insertId, login, displayName: "Integration fixture", role, realRole: role });
    }
    await connection.commit();

    // Real SQL, including backend transactions and FOR UPDATE. release is a no-op
    // because this test owns the socket and closes it only after cleanup.
    const sql: SqlConnection = {
      beginTransaction: () => connection.beginTransaction(),
      commit: () => connection.commit(), rollback: () => connection.rollback(), release: () => {},
      query: async <T,>(statement: string, params: unknown[] = []) => {
        const [rows] = await connection.execute(statement, params as never[]);
        return rows as T[];
      },
      execute: async (statement, params = []) => {
        const [result] = await connection.execute<ResultSetHeader>(statement, params as never[]);
        return { insertId: result.insertId, affectedRows: result.affectedRows };
      },
    };
    const now = Math.floor(Date.now() / 1000) * 1000;
    const issue = (user: AuthUser | null) => createParentInvite({
      getUser: async () => user, getConnection: async () => sql, now: () => now,
    });

    await t.test("student insert stores SHA-256 and expires after exactly seven days", async () => {
      const result = await issue(users[0]);
      assert.ok(result.status === "success", "Backend must return a successful invitation.");
      const token = new URL(result.url).searchParams.get("token");
      assert.ok(token && /^[A-Za-z0-9_-]{43}$/.test(token), "Token must be 32 random bytes in base64url.");
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT student_user_id, created_by_user_id, token_hash, expires_at, created_at,
           TIMESTAMPDIFF(SECOND, created_at, expires_at) AS ttl
         FROM parent_invites WHERE created_by_user_id = ?`, [users[0].id],
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].student_user_id, users[0].id);
      assert.equal(rows[0].created_by_user_id, users[0].id);
      assert.ok(rows[0].token_hash === createHash("sha256").update(token).digest("hex"), "Stored hash must match the returned token.");
      assert.ok(rows[0].token_hash !== token, "Raw token must not be stored.");
      assert.equal(Number(rows[0].ttl), 7 * 24 * 60 * 60);
      assert.equal(new Date(rows[0].expires_at).getTime(), now + 7 * 24 * 60 * 60 * 1000);
      assert.equal(Date.parse(result.expiresAt), now + 7 * 24 * 60 * 60 * 1000);
    });

    await t.test("five issues succeed and the sixth is rejected without another insert", async () => {
      for (let i = 1; i < 5; i++) {
        assert.ok((await issue(users[0])).status === "success", "Allowed issue must succeed.");
      }
      assert.deepEqual(await issue(users[0]), { status: "error", code: "rate_limited" });
      const [rows] = await connection.execute<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM parent_invites WHERE created_by_user_id = ?", [users[0].id],
      );
      assert.equal(Number(rows[0].total), 5);
    });

    await t.test("unauthenticated and other roles cannot insert invitations", async () => {
      assert.deepEqual(await issue(null), { status: "error", code: "unauthorized" });
      for (const user of users.slice(1)) {
        assert.deepEqual(await issue(user), { status: "error", code: "forbidden" });
      }
      const [rows] = await connection.execute<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM parent_invites WHERE created_by_user_id IN (?, ?, ?, ?)", ids.slice(1),
      );
      assert.equal(Number(rows[0].total), 0);
    });
  } catch {
    // Never dump mysql errors/SQL parameters or invitation responses into TAP output.
    throw new Error("Local integration failed; details withheld to protect credentials and tokens. See named subtests.");
  } finally {
    try {
      if (verified && ids.length > 0) {
        await connection.rollback();
        // Reconfirm actual server identity before cleanup writes as well.
        const [identity] = await connection.query<RowDataPacket[]>(
          "SELECT DATABASE() AS db, CURRENT_USER() AS account, @@hostname AS host, @@port AS port",
        );
        verifyServer(identity[0]);
        await connection.beginTransaction();
        const placeholders = ids.map(() => "?").join(", ");
        await connection.execute(`DELETE FROM parent_invites WHERE created_by_user_id IN (${placeholders})`, ids);
        await connection.execute(`DELETE FROM app_users WHERE id IN (${placeholders}) AND login LIKE ?`, [...ids, `${prefix}-%`]);
        await connection.commit();
        const [remaining] = await connection.execute<RowDataPacket[]>(
          `SELECT COUNT(*) AS total FROM app_users WHERE id IN (${placeholders})`, ids,
        );
        const [invites] = await connection.execute<RowDataPacket[]>(
          `SELECT COUNT(*) AS total FROM parent_invites WHERE created_by_user_id IN (${placeholders})`, ids,
        );
        assert.ok(Number(remaining[0].total) === 0 && Number(invites[0].total) === 0, "Fixture cleanup must leave no records.");
        t.diagnostic("Cleanup verified: no fixture accounts or invitations remain.");
      }
    } catch {
      throw new Error("Fixture cleanup failed; inspect only accounts with the pi-it- login prefix.");
    } finally { await connection.end(); }
  }
});
