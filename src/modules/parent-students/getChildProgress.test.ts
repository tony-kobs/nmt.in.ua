import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import type { AuthUser } from "@/modules/auth/types";
import { getChildProgress } from "./getChildProgress";
import { buildChildProgress } from "./buildChildProgress";
import { ParentAccessError } from "./types";

const parent: AuthUser = { id: 10, role: "parent", realRole: "parent", login: "fixture", displayName: "Parent" };
const summary = { child_id: 21, display_name: "Child", completed_sessions: "2", total_tasks: "12", correct_answers: "8" };
const topic = { child_id: 21, theme_id: 7, theme_code: "ALG", theme_name: "Algebra", completed_sessions: "2", total_tasks: "12", correct_answers: "8" };
const recent = { child_id: 21, session_id: 50, session_type: 1, theme_id: 7, theme_name: "Algebra", start_time: 1700000000,
  tasks_number: 10, right_number: 8, test_points: null, test_points_max: null };

function fixture(options: { empty?: boolean; user?: AuthUser | null; denyAt?: number; failAt?: number } = {}) {
  let queries = 0, acquired = 0, released = 0;
  let linked = true;
  const error = new Error("test database failure");
  const noWrite = async () => { throw new Error("Progress read must not write"); };
  const connection: SqlConnection = {
    beginTransaction: noWrite, commit: noWrite, rollback: noWrite, execute: noWrite,
    release: () => { released++; },
    query: async <T,>(sql: string, params: unknown[] = []): Promise<T[]> => {
      queries++;
      assert.deepEqual(params, [parent.id, 21]);
      assert.match(sql, /FROM parent_students ps/);
      assert.match(sql, /parent.role = 'parent' AND parent.is_banned = 0/);
      assert.match(sql, /child.role = 'student' AND child.is_banned = 0/);
      assert.match(sql, /WHERE ps.parent_user_id = \? AND ps.student_user_id = \?/);
      assert.match(sql, /ts.session_status = 1 AND ts.session_type IN \(1, 2, 3, 4, 5\)/);
      assert.ok(!sql.includes("tasks2session") && !sql.includes("right_answer") && !sql.includes("email"));
      if (queries === options.failAt) throw error;
      if (!linked || queries === options.denyAt) return [];
      if (sql.includes("child.display_name")) return [{ ...summary, ...(options.empty ? {
        completed_sessions: 0, total_tasks: null, correct_answers: null,
      } : {}) }] as T[];
      if (sql.includes("GROUP BY")) return [{ ...topic, ...(options.empty ? {
        theme_id: null, completed_sessions: 0, total_tasks: null, correct_answers: null,
      } : {}) }] as T[];
      assert.match(sql, /ORDER BY ts.start_time DESC, ts.id DESC LIMIT 5/);
      return [{ ...recent, ...(options.empty ? { session_id: null } : {}) }] as T[];
    },
  };
  const deps = { getUser: async () => options.user === undefined ? parent : options.user,
    getConnection: async () => { acquired++; return connection; } };
  return { deps, error, queries: () => queries, acquired: () => acquired, released: () => released,
    unlink: () => { linked = false; } };
}
const notFound = (error: unknown) => error instanceof ParentAccessError && error.code === "not_found";

test("all three queries scope their reads and return weighted totals, themes and dated results", async () => {
  const f = fixture();
  const result = await getChildProgress(21, f.deps);
  assert.deepEqual(result.child, { id: 21, displayName: "Child" });
  assert.deepEqual(result.summary, { completedSessions: 2, totalTasks: 12, correctAnswers: 8, correctPercent: 8 / 12 * 100 });
  assert.equal(result.topics[0].correctPercent, 8 / 12 * 100);
  assert.equal(result.recentResults[0].startedAt, 1700000000);
  assert.equal(result.recentResults[0].correctPercent, 80);
  assert.equal(f.queries(), 3); assert.equal(f.released(), 1);
});

test("empty history is distinct from zero percent", async () => {
  const f = fixture({ empty: true });
  const result = await getChildProgress(21, f.deps);
  assert.deepEqual(result.summary, { completedSessions: 0, totalTasks: 0, correctAnswers: 0, correctPercent: null });
  assert.deepEqual(result.topics, []); assert.deepEqual(result.recentResults, []);
});

test("revocation between any two queries prevents returning previously loaded data", async () => {
  for (const denyAt of [1, 2, 3]) {
    const f = fixture({ denyAt });
    await assert.rejects(getChildProgress(21, f.deps), notFound);
    assert.equal(f.queries(), denyAt); assert.equal(f.released(), 1);
  }
});

test("removed relationship denies the next call without caching", async () => {
  const f = fixture(); await getChildProgress(21, f.deps); f.unlink();
  await assert.rejects(getChildProgress(21, f.deps), notFound);
});

test("unauthenticated, other roles, bans and viewAs cannot query progress", async () => {
  for (const user of [null, ...(["student", "teacher", "admin", "dev"] as const).map((role) => ({ ...parent, role, realRole: role })),
    { ...parent, isBanned: true }, { ...parent, realRole: "admin" as const }]) {
    const f = fixture({ user });
    await assert.rejects(getChildProgress(21, f.deps), (error: unknown) => error instanceof ParentAccessError);
    assert.equal(f.acquired(), 0);
  }
});

test("invalid ids are not_found and cannot acquire a connection", async () => {
  for (const id of [undefined, null, "21", {}, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const f = fixture(); await assert.rejects(getChildProgress(id, f.deps), notFound);
    assert.equal(f.acquired(), 0);
  }
});

test("database errors at every query propagate instead of returning empty results", async () => {
  for (const failAt of [1, 2, 3]) {
    const f = fixture({ failAt });
    await assert.rejects(getChildProgress(21, f.deps), (error) => error === f.error);
    assert.equal(f.released(), 1);
  }
});

test("NMT points stay separate from correct-answer percentage and missing dates stay null", () => {
  const result = buildChildProgress(summary, [topic], [{ ...recent, session_type: 4, tasks_number: 10,
    right_number: 5, test_points: 8, test_points_max: 12, start_time: 0 }]);
  assert.equal(result.recentResults[0].correctPercent, 50);
  assert.equal(result.recentResults[0].testPoints, 8);
  assert.equal(result.recentResults[0].maxTestPoints, 12);
  assert.equal(result.recentResults[0].startedAt, null);
});
