import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import mysql, { type Connection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import type { SqlConnection } from "@/lib/db/mysql";
import type { AuthUser } from "@/modules/auth/types";
import { localConfig, readLocalConfig, target, verifyServer } from "../../../test/parentLocalMysql";
import { getChildProgress } from "./getChildProgress";
import { ParentAccessError } from "./types";

const mode = process.env.NMT_PARENT_PROGRESS_INTEGRATION;
async function verify(connection: Connection) {
  const [rows] = await connection.query<RowDataPacket[]>("SELECT DATABASE() AS db, CURRENT_USER() AS account, @@hostname AS host, @@port AS port");
  verifyServer(rows[0]);
}

test("progress integration guard rejects nonlocal target and unexpected identity", () => {
  const env = { ...target, DB_PASSWORD: "fixture-only" };
  localConfig(env, {});
  for (const key of Object.keys(target)) {
    assert.throws(() => localConfig({ ...env, [key]: "other" }, {}), /refused/);
    assert.throws(() => localConfig(env, { [key]: "other" }), /refused/);
  }
  assert.throws(() => verifyServer({ db: "other", account: "root@localhost", host: "remote", port: 3306 }), /refused/);
});

test("child progress reads on guarded local MySQL with owned fixtures only", {
  skip: mode !== "1" && mode !== "check",
}, async (t) => {
  const config = readLocalConfig();
  const sockets: Connection[] = [];
  const users: AuthUser[] = [];
  const themes: number[] = [];
  const prefix = `pg-it-${randomBytes(8).toString("hex")}`;
  let verified = false;
  try {
    const admin = await mysql.createConnection(config); sockets.push(admin); await verify(admin);
    const reader = await mysql.createConnection(config); sockets.push(reader); await verify(reader);
    verified = true;
    await reader.query("SELECT session_status, tasks_number, right_number, start_time, test_points FROM task_sessions LIMIT 0");
    if (mode === "check") { t.diagnostic("Local target verified on both connections; no writes performed."); return; }
    await admin.beginTransaction();
    for (const role of ["parent", "parent", "student", "student", "student", "teacher"] as const) {
      const login = `${prefix}-${users.length}`;
      const [row] = await admin.execute<ResultSetHeader>(
        "INSERT INTO app_users (login, password_hash, display_name, role) VALUES (?, 'integration-disabled', 'Progress fixture', ?)", [login, role],
      );
      users.push({ id: row.insertId, login, displayName: "Progress fixture", role, realRole: role });
    }
    const [parent, otherParent, child, foreign, empty, teacher] = users;
    for (const code of ["a", "b"]) {
      const [row] = await admin.execute<ResultSetHeader>("INSERT INTO themes (name, code) VALUES (?, ?)", [`Progress fixture ${code}`, `${prefix}-${code}`]);
      themes.push(row.insertId);
    }
    await admin.execute("INSERT INTO parent_students (parent_user_id, student_user_id) VALUES (?, ?), (?, ?), (?, ?)",
      [parent.id, child.id, parent.id, empty.id, otherParent.id, foreign.id]);
    let primarySession = 0;
    for (const data of [
      [child.id, 1, themes[0], 10, 8, 1, 1000, null, null],
      [child.id, 2, themes[0], 2, 0, 1, 3000, null, null],
      [child.id, 4, null, 4, 1, 1, 2000, 6, 10],
      [child.id, 3, themes[1], 100, 100, 2, 5000, null, null],
      [child.id, 5, themes[1], 5, 5, 1, 4000, null, null],
      [child.id, 99, themes[0], 999, 999, 1, 6000, null, null],
      [foreign.id, 1, themes[0], 777, 777, 1, 7000, null, null],
    ]) {
      const [row] = await admin.execute<ResultSetHeader>(
        "INSERT INTO task_sessions (user_id, session_type, theme_id, tasks_number, right_number, session_status, start_time, test_points, test_points_max, `time`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 60)", data,
      );
      if (!primarySession) primarySession = row.insertId;
    }
    const [followUp] = await admin.execute<ResultSetHeader>(
      "INSERT INTO tasks2session (task_type, task_id, session_id, user_id, status) VALUES (1, 1, ?, ?, 1)", [primarySession, child.id],
    );
    await admin.execute("INSERT INTO practice_task_origin (tasks2session_id, session_id, origin) VALUES (?, ?, 'similar')", [followUp.insertId, primarySession]);
    await admin.commit();

    const noWrite = async () => { throw new Error("Progress reader must never write"); };
    const connection: SqlConnection = {
      beginTransaction: noWrite, execute: noWrite, commit: noWrite, rollback: noWrite, release: () => {},
      query: async <T,>(sql: string, params: unknown[] = []) => {
        const [rows] = await reader.execute(sql, params as never[]); return rows as T[];
      },
    };
    const deps = (user: AuthUser | null) => ({ getUser: async () => user, getConnection: async () => connection });
    const notFound = (error: unknown) => error instanceof ParentAccessError && error.code === "not_found";
    async function edit(sql: string, values: (number | string)[]) {
      await verify(admin); await admin.beginTransaction(); await admin.execute(sql, values); await admin.commit();
    }

    await t.test("own-child weighted totals exclude unfinished sessions, unknown modes and follow-ups", async () => {
      const result = await getChildProgress(child.id, deps(parent));
      assert.deepEqual(result.summary, { completedSessions: 4, totalTasks: 21, correctAnswers: 14, correctPercent: 14 / 21 * 100 });
      const algebra = result.topics.find((row) => row.themeId === themes[0]);
      const geometry = result.topics.find((row) => row.themeId === themes[1]);
      assert.ok(algebra && geometry);
      assert.equal(algebra.themeCode, `${prefix}-a`);
      assert.equal(algebra.attemptsCount, 2);
      assert.equal(algebra.overallPercent, 40);
      assert.equal(algebra.lastThreePercent, 40);
      assert.equal(algebra.avgSecondsPerTask, 18);
      assert.ok(algebra.displayIndex >= 1);
      assert.equal(geometry.attemptsCount, 1);
      assert.equal(geometry.overallPercent, 100);
      assert.equal(geometry.avgSecondsPerTask, 12);
      assert.equal(result.recentResults.length, 4);
      assert.deepEqual(result.recentResults.map((row) => row.startedAt), [4000, 3000, 2000, 1000]);
      const nmt = result.recentResults.find((row) => row.sessionType === 4)!;
      assert.equal(nmt.correctPercent, 25); assert.equal(nmt.testPoints, 6); assert.equal(nmt.maxTestPoints, 10);
      assert.ok(!JSON.stringify(result).includes("password_hash") && !JSON.stringify(result).includes("email"));
    });

    await t.test("empty history has null percentage and no topic/recent rows", async () => {
      const result = await getChildProgress(empty.id, deps(parent));
      assert.deepEqual(result.summary, { completedSessions: 0, totalTasks: 0, correctAnswers: 0, correctPercent: null });
      assert.deepEqual(result.recentResults, []);
      assert.ok(result.topics.some((row) => row.themeId === themes[0]));
      assert.ok(result.topics.every((row) => row.attemptsCount === 0 && row.overallPercent === null && row.lastThreePercent === null));
    });

    await t.test("foreign children are unavailable and each parent sees only their child", async () => {
      await assert.rejects(getChildProgress(foreign.id, deps(parent)), notFound);
      await assert.rejects(getChildProgress(child.id, deps(otherParent)), notFound);
      assert.equal((await getChildProgress(foreign.id, deps(otherParent))).summary.totalTasks, 777);
    });

    await t.test("unlink, changed account roles and bans remove access immediately", async () => {
      await edit("DELETE FROM parent_students WHERE parent_user_id = ? AND student_user_id = ?", [parent.id, child.id]);
      await assert.rejects(getChildProgress(child.id, deps(parent)), notFound);
      await edit("INSERT INTO parent_students (parent_user_id, student_user_id) VALUES (?, ?)", [parent.id, child.id]);
      for (const user of [parent, child]) {
        await edit("UPDATE app_users SET is_banned = 1 WHERE id = ?", [user.id]);
        await assert.rejects(getChildProgress(child.id, deps(parent)), notFound);
        await edit("UPDATE app_users SET is_banned = 0, role = 'teacher' WHERE id = ?", [user.id]);
        await assert.rejects(getChildProgress(child.id, deps(parent)), notFound);
        await edit("UPDATE app_users SET role = ? WHERE id = ?", [user.role, user.id]);
      }
    });

    await t.test("other roles cannot read progress and query errors are not hidden", async () => {
      for (const user of [null, teacher, child, { ...parent, role: "admin" as const, realRole: "admin" as const },
        { ...parent, role: "dev" as const, realRole: "dev" as const }]) {
        await assert.rejects(getChildProgress(child.id, deps(user)), (error: unknown) => error instanceof ParentAccessError);
      }
      const failure = new Error("simulated read failure");
      await assert.rejects(getChildProgress(child.id, { getUser: async () => parent,
        getConnection: async () => ({ ...connection, query: async () => { throw failure; } }),
      }), (error) => error === failure);
    });
  } catch {
    throw new Error("Local progress integration failed; private SQL details withheld. See named subtests.");
  } finally {
    try {
      for (const socket of sockets) await socket.rollback();
      if (verified && users.length) {
        const admin = sockets[0]; await verify(admin); await admin.beginTransaction();
        const ids = users.map((user) => user.id); const placeholders = ids.map(() => "?").join(", ");
        await admin.execute(`DELETE po FROM practice_task_origin po INNER JOIN tasks2session t ON t.id = po.tasks2session_id WHERE t.user_id IN (${placeholders})`, ids);
        await admin.execute(`DELETE FROM tasks2session WHERE user_id IN (${placeholders})`, ids);
        await admin.execute(`DELETE FROM task_sessions WHERE user_id IN (${placeholders})`, ids);
        await admin.execute(`DELETE FROM parent_students WHERE parent_user_id IN (${placeholders})`, ids);
        await admin.execute(`DELETE FROM app_users WHERE id IN (${placeholders}) AND login LIKE ?`, [...ids, `${prefix}-%`]);
        if (themes.length) await admin.execute(`DELETE FROM themes WHERE id IN (${themes.map(() => "?").join(", ")}) AND code LIKE ?`, [...themes, `${prefix}-%`]);
        await admin.commit();
        for (const [table, column] of [["app_users", "id"], ["task_sessions", "user_id"], ["tasks2session", "user_id"], ["parent_students", "parent_user_id"]]) {
          const [rows] = await admin.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM ${table} WHERE ${column} IN (${placeholders})`, ids);
          assert.equal(Number(rows[0].total), 0, "Owned fixtures must be removed");
        }
        const [remainingThemes] = await admin.execute<RowDataPacket[]>("SELECT id FROM themes WHERE code LIKE ?", [`${prefix}-%`]);
        assert.equal(remainingThemes.length, 0);
        t.diagnostic("Cleanup verified: owned accounts, relationships, sessions, follow-ups and themes removed.");
      }
    } catch { throw new Error("Progress fixture cleanup failed; inspect only this run's pg-it- fixtures."); }
    finally { await Promise.all(sockets.map((socket) => socket.end())); }
  }
});
