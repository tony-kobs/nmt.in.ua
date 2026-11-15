import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import mysql, { type Connection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import type { SqlConnection } from "@/lib/db/mysql";
import type { AuthUser } from "@/modules/auth/types";
import { createParentInvite } from "./createParentInvite";
import { localConfig, readLocalConfig, target, verifyServer } from "../../../test/parentLocalMysql";

const mode = process.env.NMT_PARENT_INVITE_INTEGRATION;
const identitySql = "SELECT DATABASE() AS db, CURRENT_USER() AS account, @@hostname AS host, @@port AS port";
async function verify(connection: Connection) {
  const [rows] = await connection.query<RowDataPacket[]>(identitySql);
  verifyServer(rows[0]);
}

test("integration guard rejects remote targets and unexpected identities", () => {
  const env = { ...target, DB_PASSWORD: "test-only" };
  localConfig(env, {});
  for (const key of Object.keys(target)) {
    assert.throws(() => localConfig({ ...env, [key]: "other" }, {}), /refused/);
    assert.throws(() => localConfig(env, { [key]: "other" }), /refused/);
  }
  const row = { db: "nmt_local", account: "nmt_dev@localhost", host: "machine", port: 3306 };
  verifyServer(row, "machine.local");
  for (const patch of [{ db: "other" }, { account: "root@localhost" }, { host: "remote" }, { port: 3307 }]) {
    assert.throws(() => verifyServer({ ...row, ...patch }, "machine"), /refused/);
  }
});

test("student and teacher invitation quotas on guarded local MySQL", {
  skip: mode !== "1" && mode !== "check",
}, async (t) => {
  const config = readLocalConfig();
  const sockets: Connection[] = [];
  const users: AuthUser[] = [];
  const prefix = `pi-it-${randomBytes(8).toString("hex")}`;
  let verified = false;
  try {
    const admin = await mysql.createConnection(config); sockets.push(admin);
    await verify(admin);
    verified = true;
    await admin.query("SELECT token_hash, used_at, revoked_at FROM parent_invites LIMIT 0");
    if (mode === "check") { t.diagnostic("Local identity verified; preflight performed no writes."); return; }
    await admin.beginTransaction();
    for (const role of ["student", "teacher", "parent", "admin", "dev", "student", "student"] as const) {
      const login = `${prefix}-${users.length}`;
      const [row] = await admin.execute<ResultSetHeader>(
        "INSERT INTO app_users (login, password_hash, display_name, role) VALUES (?, 'integration-disabled', 'Invite fixture', ?)", [login, role],
      );
      users.push({ id: row.insertId, login, displayName: "Fixture", role, realRole: role });
    }
    const [student, teacher, parent, staff, dev, second, foreign] = users;
    await admin.execute("INSERT INTO teacher_students (teacher_user_id, student_user_id) VALUES (?, ?), (?, ?)",
      [teacher.id, student.id, teacher.id, second.id]);
    await admin.commit();

    function adapt(connection: Connection, failInsert = false): SqlConnection {
      return {
        beginTransaction: () => connection.beginTransaction(), commit: () => connection.commit(),
        rollback: () => connection.rollback(), release: () => {},
        query: async <T,>(sql: string, params: unknown[] = []) => {
          const [rows] = await connection.execute(sql, params as never[]); return rows as T[];
        },
        execute: async (sql, params = []) => {
          if (failInsert) throw new Error("Injected insert failure");
          const [row] = await connection.execute<ResultSetHeader>(sql, params as never[]);
          return { insertId: row.insertId, affectedRows: row.affectedRows };
        },
      };
    }
    async function issue(user: AuthUser | null, targetId?: number, connection = admin, failInsert = false) {
      await verify(connection);
      return createParentInvite(targetId === undefined ? {} : { studentId: targetId }, {
        getUser: async () => user, getConnection: async () => adapt(connection, failInsert), now: Date.now,
      });
    }
    async function count(authorId: number) {
      const [rows] = await admin.execute<RowDataPacket[]>("SELECT COUNT(*) AS total FROM parent_invites WHERE created_by_user_id = ?", [authorId]);
      return Number(rows[0].total);
    }
    async function edit(sql: string, params: (number | string)[]) {
      await verify(admin); await admin.beginTransaction(); await admin.execute(sql, params); await admin.commit();
    }

    await t.test("student writes only SHA-256 with 7-day expiry and correct ownership", async () => {
      const result = await issue(student);
      assert.ok(result.status === "success", "Student issue must succeed");
      const token = new URL(result.url).searchParams.get("token")!;
      const [rows] = await admin.execute<RowDataPacket[]>(
        "SELECT student_user_id, token_hash, TIMESTAMPDIFF(SECOND, created_at, expires_at) AS ttl FROM parent_invites WHERE created_by_user_id = ?", [student.id],
      );
      assert.equal(rows.length, 1); assert.equal(rows[0].student_user_id, student.id);
      assert.ok(rows[0].token_hash === createHash("sha256").update(token).digest("hex"), "Stored hash must match without exposing token");
      assert.equal(Number(rows[0].ttl), 7 * 24 * 60 * 60);
    });

    await t.test("student active quota excludes used, revoked and expired but hourly quota counts all", async () => {
      assert.equal((await issue(student)).status, "success"); assert.equal((await issue(student)).status, "success");
      assert.deepEqual(await issue(student), { status: "error", code: "rate_limited" });
      const [rows] = await admin.execute<RowDataPacket[]>("SELECT id FROM parent_invites WHERE created_by_user_id = ? ORDER BY id", [student.id]);
      await edit("UPDATE parent_invites SET used_at = CURRENT_TIMESTAMP WHERE id = ?", [rows[0].id]);
      await edit("UPDATE parent_invites SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?", [rows[1].id]);
      await edit("UPDATE parent_invites SET expires_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 SECOND) WHERE id = ?", [rows[2].id]);
      assert.equal((await issue(student)).status, "success"); assert.equal((await issue(student)).status, "success");
      assert.deepEqual(await issue(student), { status: "error", code: "rate_limited" });
      assert.equal(await count(student.id), 5);
    });

    await t.test("teacher writes correct author and target; active quota is per author/target", async () => {
      for (let i = 0; i < 3; i++) assert.equal((await issue(teacher, student.id)).status, "success");
      assert.deepEqual(await issue(teacher, student.id), { status: "error", code: "rate_limited" });
      assert.equal((await issue(teacher, second.id)).status, "success");
      const [rows] = await admin.execute<RowDataPacket[]>("SELECT student_user_id, created_by_user_id FROM parent_invites WHERE created_by_user_id = ?", [teacher.id]);
      assert.equal(rows.length, 4); assert.ok(rows.every((r) => r.created_by_user_id === teacher.id));
      assert.equal(rows.filter((r) => r.student_user_id === student.id).length, 3);
    });

    await t.test("foreign, deleted link, invalid target, changed roles and banned accounts are forbidden", async () => {
      const forbidden = { status: "error", code: "forbidden" };
      assert.deepEqual(await issue(teacher, foreign.id), forbidden);
      assert.deepEqual(await issue(teacher, -1), forbidden);
      assert.deepEqual(await issue(student, second.id), forbidden);
      await edit("DELETE FROM teacher_students WHERE teacher_user_id = ? AND student_user_id = ?", [teacher.id, second.id]);
      assert.deepEqual(await issue(teacher, second.id), forbidden);
      await edit("INSERT INTO teacher_students (teacher_user_id, student_user_id) VALUES (?, ?)", [teacher.id, second.id]);
      for (const user of [teacher, second]) {
        await edit("UPDATE app_users SET is_banned = 1 WHERE id = ?", [user.id]);
        assert.deepEqual(await issue(teacher, second.id), forbidden);
        await edit("UPDATE app_users SET is_banned = 0, role = 'parent' WHERE id = ?", [user.id]);
        assert.deepEqual(await issue(teacher, second.id), forbidden);
        await edit("UPDATE app_users SET role = ? WHERE id = ?", [user.role, user.id]);
      }
      assert.deepEqual(await issue(null), { status: "error", code: "unauthorized" });
      for (const user of [parent, staff, dev, { ...teacher, realRole: "admin" as const }, { ...student, realRole: "teacher" as const }]) {
        assert.deepEqual(await issue(user, second.id), forbidden);
      }
    });

    await t.test("rollback leaves quota unchanged after insertion failure", async () => {
      const before = await count(teacher.id);
      assert.deepEqual(await issue(teacher, second.id, admin, true), { status: "error", code: "generic" });
      assert.equal(await count(teacher.id), before);
      assert.equal((await issue(teacher, second.id)).status, "success");
    });

    await t.test("parallel teacher requests across students cannot exceed 50 hourly issues", async () => {
      // Existing test records stay in hourly totals but are no longer active.
      await edit("UPDATE parent_invites SET revoked_at = CURRENT_TIMESTAMP WHERE created_by_user_id = ?", [teacher.id]);
      const before = await count(teacher.id);
      await verify(admin); await admin.beginTransaction();
      for (let i = before; i < 49; i++) {
        await admin.execute("INSERT INTO parent_invites (student_user_id, created_by_user_id, token_hash, expires_at, revoked_at) VALUES (?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 7 DAY), CURRENT_TIMESTAMP)",
          [student.id, teacher.id, randomBytes(32).toString("hex")]);
      }
      await admin.commit();
      const other = await mysql.createConnection(config); sockets.push(other); await verify(other);
      const results = await Promise.all([issue(teacher, student.id, admin), issue(teacher, second.id, other)]);
      assert.equal(results.filter((r) => r.status === "success").length, 1);
      assert.equal(results.filter((r) => r.status === "error" && r.code === "rate_limited").length, 1);
      assert.equal(await count(teacher.id), 50);
    });

    await t.test("parallel student requests cannot exceed three active invitations", async () => {
      // This previously unused student has no hourly history.
      for (let i = 0; i < 2; i++) assert.equal((await issue(second)).status, "success");
      const other = sockets[1];
      const results = await Promise.all([issue(second, undefined, admin), issue(second, undefined, other)]);
      assert.equal(results.filter((r) => r.status === "success").length, 1);
      assert.equal(results.filter((r) => r.status === "error" && r.code === "rate_limited").length, 1);
      assert.equal(await count(second.id), 3);
    });
  } catch {
    throw new Error("Local invite integration failed; private driver details withheld. See named subtests.");
  } finally {
    try {
      for (const connection of sockets) await connection.rollback();
      if (verified && users.length) {
        const admin = sockets[0]; await verify(admin);
        await admin.beginTransaction();
        const ids = users.map((u) => u.id); const placeholders = ids.map(() => "?").join(", ");
        await admin.execute(`DELETE FROM parent_invites WHERE created_by_user_id IN (${placeholders})`, ids);
        await admin.execute(`DELETE FROM teacher_students WHERE teacher_user_id IN (${placeholders})`, ids);
        await admin.execute(`DELETE FROM app_users WHERE id IN (${placeholders}) AND login LIKE ?`, [...ids, `${prefix}-%`]);
        await admin.commit();
        for (const [table, column] of [["app_users", "id"], ["parent_invites", "created_by_user_id"], ["teacher_students", "teacher_user_id"]]) {
          const [rows] = await admin.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM ${table} WHERE ${column} IN (${placeholders})`, ids);
          assert.equal(Number(rows[0].total), 0, "All owned fixtures must be removed");
        }
        t.diagnostic("Cleanup verified: all owned accounts, links and invitations removed.");
      }
    } catch { throw new Error("Fixture cleanup failed; inspect only pi-it- fixtures from this run."); }
    finally { await Promise.all(sockets.map((connection) => connection.end())); }
  }
});
