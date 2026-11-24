import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import mysql, { type Connection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import type { SqlConnection } from "@/lib/db/mysql";
import { hashAuthToken } from "@/modules/auth/authTokens";
import { verifyPassword } from "@/modules/auth/password";
import { needsEmailVerification } from "@/modules/auth/needsEmailVerification";
import { localConfig, readLocalConfig, target, verifyServer } from "../../../test/parentLocalMysql";
import { registerParentFromInvite } from "./registerParentFromInvite";

const mode = process.env.NMT_PARENT_REGISTER_INTEGRATION;

test("registration integration guard refuses nonlocal configuration and identities", () => {
  const env = { ...target, DB_PASSWORD: "fixture-only" };
  localConfig(env, {});
  for (const key of Object.keys(target)) {
    assert.throws(() => localConfig({ ...env, [key]: "other" }, {}), /refused/);
    assert.throws(() => localConfig(env, { [key]: "other" }), /refused/);
  }
  const row = { db: "nmt_local", account: "nmt_dev@localhost", host: "machine", port: 3306 };
  verifyServer(row, "machine.local");
  for (const patch of [{ db: "production" }, { account: "root@localhost" }, { account: "nmt_dev@%" },
    { host: "remote" }, { port: 3307 }]) {
    assert.throws(() => verifyServer({ ...row, ...patch }, "machine"), /refused/);
  }
});

async function checkServer(connection: Connection) {
  const [rows] = await connection.query<RowDataPacket[]>(
    "SELECT DATABASE() AS db, CURRENT_USER() AS account, @@hostname AS host, @@port AS port",
  );
  verifyServer(rows[0]);
}

test("parent registration transactions on guarded local MySQL", {
  skip: mode !== "1" && mode !== "check",
}, async (t) => {
  const config = readLocalConfig();
  const connections: Connection[] = [];
  const prefix = `pr-it-${randomBytes(8).toString("hex")}`;
  const emails = ["success", "taken", "rollback", "retry"].map((name) => `${prefix}-${name}@example.com`);
  const studentLogin = `${prefix}-student`;
  let studentId: number | undefined;
  let verified = false;
  let mailCalls = 0;
  try {
    const writer = await mysql.createConnection(config);
    connections.push(writer);
    await checkServer(writer);
    const observer = await mysql.createConnection(config);
    connections.push(observer);
    await checkServer(observer);
    verified = true;
    t.diagnostic("Verified local target, database, account, hostname and port on both connections.");
    await observer.query("SELECT parent_user_id, student_user_id FROM parent_students LIMIT 0");
    await observer.query("SELECT id, used_at, used_by_user_id FROM parent_invites LIMIT 0");
    if (mode === "check") {
      t.diagnostic("Read-only preflight passed; no fixtures created.");
      return;
    }

    await writer.beginTransaction();
    const [student] = await writer.execute<ResultSetHeader>(
      "INSERT INTO app_users (login, password_hash, display_name, role) VALUES (?, ?, ?, 'student')",
      [studentLogin, "integration-disabled", "Parent registration fixture"],
    );
    const fixtureStudentId = student.insertId;
    studentId = fixtureStudentId;
    await writer.execute(
      "INSERT INTO app_users (login, password_hash, display_name, role, email) VALUES (?, ?, ?, 'parent', ?)",
      [`${prefix}-existing`, "integration-disabled", "Own existing fixture", emails[1]],
    );
    await writer.commit();

    async function invitation() {
      await checkServer(writer);
      const token = randomBytes(32).toString("base64url");
      await writer.beginTransaction();
      const [insert] = await writer.execute<ResultSetHeader>(
        `INSERT INTO parent_invites (student_user_id, created_by_user_id, token_hash, expires_at)
         VALUES (?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 7 DAY))`,
        [fixtureStudentId, fixtureStudentId, hashAuthToken(token)],
      );
      await writer.commit();
      return { token, id: insert.insertId };
    }

    function adapter(duplicateLink = false): SqlConnection {
      return {
        beginTransaction: () => writer.beginTransaction(), commit: () => writer.commit(),
        rollback: () => writer.rollback(), release: () => {},
        query: async <T,>(sql: string, params: unknown[] = []) => {
          const [rows] = await writer.execute(sql, params as never[]);
          return rows as T[];
        },
        execute: async (sql, params = []) => {
          const [row] = await writer.execute<ResultSetHeader>(sql, params as never[]);
          if (duplicateLink && sql.includes("INSERT INTO parent_students")) {
            // Real duplicate-key error after the account AND first link have been written.
            try { await writer.execute(sql, params as never[]); }
            catch (error) {
              if ((error as { code?: string }).code === "ER_DUP_ENTRY") duplicateObserved = true;
              throw new Error("Injected real duplicate-link write failure");
            }
            throw new Error("Expected duplicate link to fail");
          }
          return { insertId: row.insertId, affectedRows: row.affectedRows };
        },
      };
    }
    let duplicateObserved = false;
    const password = randomBytes(18).toString("base64url");
    const submit = async (token: string, email: string, duplicateLink = false) => {
      await checkServer(writer);
      return registerParentFromInvite({ token, email, displayName: "Integration Parent", password,
        passwordConfirm: password, role: "admin", studentId: -1 }, {
        getConnection: async () => adapter(duplicateLink),
        sendVerificationMail: async (input) => {
          // An independent connection must see all writes before mail is attempted.
          const [rows] = await observer.execute<RowDataPacket[]>(
            `SELECT u.id FROM app_users u
             INNER JOIN parent_students ps ON ps.parent_user_id = u.id
             INNER JOIN parent_invites pi ON pi.used_by_user_id = u.id
             WHERE u.id = ? AND u.email = ? AND ps.student_user_id = ? AND pi.used_at IS NOT NULL`,
            [input.userId, email, fixtureStudentId],
          );
          assert.equal(rows.length, 1, "Mail must follow a visible commit");
          mailCalls++;
          return { ok: true };
        },
      });
    };

    await t.test("success commits parent, link and token use; email remains unverified", async () => {
      const invite = await invitation();
      const result = await submit(invite.token, emails[0]);
      assert.ok(result.status === "success" && result.verificationSent, "Registration and mock mail must succeed");
      const [rows] = await observer.execute<RowDataPacket[]>(
        `SELECT u.id, u.role, u.password_hash, u.email_verified_at, u.email_verify_required,
                ps.student_user_id, pi.used_at, pi.used_by_user_id
         FROM app_users u INNER JOIN parent_students ps ON ps.parent_user_id = u.id
         INNER JOIN parent_invites pi ON pi.used_by_user_id = u.id WHERE u.email = ? AND pi.id = ?`,
        [emails[0], invite.id],
      );
      assert.equal(rows.length, 1);
      const row = rows[0];
      assert.equal(row.role, "parent");
      assert.equal(row.student_user_id, fixtureStudentId);
      assert.equal(row.used_by_user_id, row.id);
      assert.ok(row.used_at !== null);
      assert.ok(verifyPassword(password, row.password_hash), "Stored password must use the shared hash");
      assert.equal(row.email_verified_at, null);
      assert.equal(Number(row.email_verify_required), 1);
      assert.equal(needsEmailVerification({ id: row.id, login: "fixture", displayName: "Fixture", role: "parent",
        email: emails[0], emailVerified: false, emailVerifyRequired: true }), true);

      assert.deepEqual(await submit(invite.token, emails[3]), { status: "error", code: "invalidInvite" });
      const [retry] = await observer.execute<RowDataPacket[]>("SELECT id FROM app_users WHERE email = ?", [emails[3]]);
      assert.equal(retry.length, 0);
      assert.equal(mailCalls, 1);
    });

    await t.test("taken email is not attached; invitation stays unused", async () => {
      const invite = await invitation();
      assert.deepEqual(await submit(invite.token, emails[1]), { status: "error", code: "emailTaken" });
      const [rows] = await observer.execute<RowDataPacket[]>(
        "SELECT used_at, used_by_user_id FROM parent_invites WHERE id = ?", [invite.id],
      );
      assert.equal(rows[0].used_at, null);
      assert.equal(rows[0].used_by_user_id, null);
      const [links] = await observer.execute<RowDataPacket[]>(
        "SELECT ps.parent_user_id FROM parent_students ps INNER JOIN app_users u ON u.id = ps.parent_user_id WHERE u.email = ?", [emails[1]],
      );
      assert.equal(links.length, 0);
      assert.equal(mailCalls, 1);
    });

    await t.test("real duplicate-link SQL error rolls back account, link and token consumption", async () => {
      const invite = await invitation();
      assert.deepEqual(await submit(invite.token, emails[2], true), { status: "error", code: "serverError" });
      assert.equal(duplicateObserved, true);
      const [users] = await observer.execute<RowDataPacket[]>("SELECT id FROM app_users WHERE email = ?", [emails[2]]);
      assert.equal(users.length, 0);
      const [links] = await observer.execute<RowDataPacket[]>(
        "SELECT parent_user_id FROM parent_students WHERE student_user_id = ?", [fixtureStudentId],
      );
      assert.equal(links.length, 1, "Only the earlier successful fixture link may remain");
      const [invites] = await observer.execute<RowDataPacket[]>(
        "SELECT used_at, used_by_user_id FROM parent_invites WHERE id = ?", [invite.id],
      );
      assert.equal(invites[0].used_at, null);
      assert.equal(invites[0].used_by_user_id, null);
      assert.equal(mailCalls, 1);
    });
  } catch {
    throw new Error("Local registration integration failed; private driver details withheld. See named subtests.");
  } finally {
    try {
      if (verified && studentId !== undefined) {
        const writer = connections[0];
        await writer.rollback();
        await checkServer(writer);
        await writer.beginTransaction();
        // Every predicate identifies only this run's randomly named fixtures.
        await writer.execute("DELETE FROM parent_invites WHERE student_user_id = ?", [studentId]);
        await writer.execute("DELETE FROM parent_students WHERE student_user_id = ?", [studentId]);
        await writer.execute("DELETE FROM app_users WHERE email IN (?, ?, ?, ?) OR (id = ? AND login = ?)",
          [...emails, studentId, studentLogin]);
        await writer.commit();
        const [users] = await writer.execute<RowDataPacket[]>(
          "SELECT id FROM app_users WHERE email IN (?, ?, ?, ?) OR (id = ? AND login = ?)", [...emails, studentId, studentLogin],
        );
        const [links] = await writer.execute<RowDataPacket[]>("SELECT parent_user_id FROM parent_students WHERE student_user_id = ?", [studentId]);
        const [invites] = await writer.execute<RowDataPacket[]>("SELECT id FROM parent_invites WHERE student_user_id = ?", [studentId]);
        assert.ok(users.length === 0 && links.length === 0 && invites.length === 0, "All fixture records must be removed");
        t.diagnostic("Cleanup verified: no test accounts, links or invitations remain; no real mail sent.");
      }
    } catch { throw new Error("Registration fixture cleanup failed; inspect only this run's pr-it- fixtures."); }
    finally { await Promise.all(connections.map((connection) => connection.end())); }
  }
});
