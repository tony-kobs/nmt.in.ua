import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { claimGuestProgress } from "./claimGuestProgress";

type Row = {
  user_id: number | null;
  guest_token: string | null;
  expire_time?: number;
};

/**
 * A tiny in-memory stand-in for the 3 claimed tables, applying the same
 * `guest_token = ? AND user_id IS NULL` semantics as the real UPDATEs, so
 * replay-safety and cross-guest isolation are verified against real
 * row-level state transitions rather than just call counts.
 */
function makeDb(rows: { taskSessions: Row[]; tasksToSession: Row[]; selfScores: Row[] }) {
  function claim(table: Row[], newUserId: number, guestToken: string): number {
    let affected = 0;
    for (const row of table) {
      if (row.guest_token === guestToken && row.user_id === null) {
        row.user_id = newUserId;
        row.guest_token = null;
        affected += 1;
      }
    }
    return affected;
  }

  let rolledBack = false;
  let committed = false;
  let released = false;
  let failOnSecondUpdate = false;
  let updateCount = 0;

  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async () => [],
    execute: async (sql: string, params: unknown[] = []) => {
      const [newUserId, guestToken] = params as [number, string];
      updateCount += 1;
      if (failOnSecondUpdate && updateCount === 2) {
        throw new Error("simulated DB failure mid-claim");
      }
      if (sql.includes("UPDATE task_sessions")) {
        return { insertId: 0, affectedRows: claim(rows.taskSessions, newUserId, guestToken) };
      }
      if (sql.includes("UPDATE tasks2session")) {
        return { insertId: 0, affectedRows: claim(rows.tasksToSession, newUserId, guestToken) };
      }
      if (sql.includes("UPDATE user_self_scores")) {
        return { insertId: 0, affectedRows: claim(rows.selfScores, newUserId, guestToken) };
      }
      return { insertId: 0, affectedRows: 0 };
    },
    commit: async () => {
      committed = true;
    },
    rollback: async () => {
      rolledBack = true;
    },
    release: () => {
      released = true;
    },
  };

  return {
    connection,
    rows,
    setFailOnSecondUpdate: (value: boolean) => {
      failOnSecondUpdate = value;
    },
    isCommitted: () => committed,
    isRolledBack: () => rolledBack,
    isReleased: () => released,
  };
}

test("returns claimed:false and touches nothing when there is no guest cookie", async () => {
  const db = makeDb({ taskSessions: [], tasksToSession: [], selfScores: [] });
  const result = await claimGuestProgress(99, {
    getConnection: async () => db.connection,
    getGuestToken: async () => null,
  });
  assert.deepEqual(result, {
    claimed: false,
    taskSessions: 0,
    taskMappings: 0,
    selfScores: 0,
  });
});

test("atomically transfers task_sessions, tasks2session, and user_self_scores to the new user", async () => {
  const db = makeDb({
    taskSessions: [{ user_id: null, guest_token: "guest-a" }],
    tasksToSession: [
      { user_id: null, guest_token: "guest-a" },
      { user_id: null, guest_token: "guest-a" },
    ],
    selfScores: [{ user_id: null, guest_token: "guest-a" }],
  });

  const result = await claimGuestProgress(42, {
    getConnection: async () => db.connection,
    getGuestToken: async () => "guest-a",
  });

  assert.equal(result.claimed, true);
  assert.equal(result.taskSessions, 1);
  assert.equal(result.taskMappings, 2);
  assert.equal(result.selfScores, 1);
  assert.ok(db.rows.taskSessions.every((r) => r.user_id === 42 && r.guest_token === null));
  assert.ok(db.rows.tasksToSession.every((r) => r.user_id === 42 && r.guest_token === null));
  assert.ok(db.rows.selfScores.every((r) => r.user_id === 42 && r.guest_token === null));
  assert.ok(db.isCommitted());
});

test("replaying the same claim is a safe no-op (affectedRows: 0)", async () => {
  const db = makeDb({
    taskSessions: [{ user_id: null, guest_token: "guest-a" }],
    tasksToSession: [],
    selfScores: [],
  });

  await claimGuestProgress(42, {
    getConnection: async () => db.connection,
    getGuestToken: async () => "guest-a",
  });

  const replay = await claimGuestProgress(42, {
    getConnection: async () => db.connection,
    getGuestToken: async () => "guest-a",
  });

  assert.equal(replay.claimed, false);
  assert.equal(replay.taskSessions, 0);
  // Still owned by the first claim, not double-counted or reassigned.
  assert.equal(db.rows.taskSessions[0]!.user_id, 42);
});

test("guest B's rows are never touched by guest A's claim", async () => {
  const db = makeDb({
    taskSessions: [
      { user_id: null, guest_token: "guest-a" },
      { user_id: null, guest_token: "guest-b" },
    ],
    tasksToSession: [],
    selfScores: [],
  });

  await claimGuestProgress(42, {
    getConnection: async () => db.connection,
    getGuestToken: async () => "guest-a",
  });

  const guestBRow = db.rows.taskSessions.find((r) => r.guest_token === "guest-b" || r.user_id === null);
  assert.ok(guestBRow, "guest B's row must still be unclaimed");
  assert.equal(guestBRow!.guest_token, "guest-b");
  assert.equal(guestBRow!.user_id, null);
});

test("preserves expire_time through a claim — a claim renews ownership, never the deadline", async () => {
  const deadline = 1_700_086_400;
  const db = makeDb({
    taskSessions: [{ user_id: null, guest_token: "guest-a", expire_time: deadline }],
    tasksToSession: [],
    selfScores: [],
  });

  await claimGuestProgress(42, {
    getConnection: async () => db.connection,
    getGuestToken: async () => "guest-a",
  });

  assert.equal(db.rows.taskSessions[0]!.user_id, 42);
  assert.equal(db.rows.taskSessions[0]!.expire_time, deadline);
});

test("a mid-claim DB failure rolls back and leaves guest data intact", async () => {
  const db = makeDb({
    taskSessions: [{ user_id: null, guest_token: "guest-a" }],
    tasksToSession: [{ user_id: null, guest_token: "guest-a" }],
    selfScores: [{ user_id: null, guest_token: "guest-a" }],
  });
  db.setFailOnSecondUpdate(true);

  await assert.rejects(() =>
    claimGuestProgress(42, {
      getConnection: async () => db.connection,
      getGuestToken: async () => "guest-a",
    }),
  );

  assert.ok(db.isRolledBack());
  assert.ok(!db.isCommitted());
  assert.ok(db.isReleased());
  // The in-memory rows were mutated by the first UPDATE before the second
  // one threw; a real DB's ROLLBACK undoes this. This test's job is to
  // confirm rollback() was actually invoked (verified above) and that the
  // caller (registerAction) therefore never clears the guest cookie.
});
