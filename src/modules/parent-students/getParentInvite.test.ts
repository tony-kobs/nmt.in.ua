import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { getParentInvite } from "./getParentInvite";

const token = randomBytes(32).toString("base64url");
const active = { used_at: null, revoked_at: null, unexpired: 1, student_role: "student", is_banned: 0 };

function fixture(rows: unknown[] = [active], fail = false) {
  let released = false;
  const noWrites = async () => { throw new Error("Read-only lookup must not write"); };
  const connection: SqlConnection = {
    beginTransaction: noWrites, execute: noWrites, commit: noWrites, rollback: noWrites,
    release: () => { released = true; },
    query: async <T,>(sql: string, params?: unknown[]) => {
      assert.match(sql, /INNER JOIN app_users u ON u.id = pi.student_user_id/);
      assert.match(sql, /pi.expires_at > CURRENT_TIMESTAMP/);
      assert.match(sql, /WHERE pi.token_hash = \?/);
      assert.deepEqual(params, [createHash("sha256").update(token).digest("hex")]);
      assert.ok(!sql.includes(token));
      if (fail) throw new Error("private database details");
      return rows as T[];
    },
  };
  return { deps: { getConnection: async () => connection }, released: () => released };
}

test("returns only validity for a live student invite and releases the connection", async () => {
  const f = fixture();
  assert.deepEqual(await getParentInvite(token, f.deps), { valid: true });
  assert.equal(f.released(), true);
});

test("invalid format never acquires a connection", async () => {
  let acquired = false;
  const result = await getParentInvite("invalid", { getConnection: async () => {
    acquired = true;
    throw new Error("must not connect");
  } });
  assert.deepEqual(result, { valid: false });
  assert.equal(acquired, false);
});

test("missing invite or deleted student is invalid", async () => {
  const f = fixture([]);
  assert.deepEqual(await getParentInvite(token, f.deps), { valid: false });
  assert.equal(f.released(), true);
});

test("used, revoked, expired, banned and wrong-role invitations are invalid", async () => {
  for (const patch of [
    { used_at: "2026-11-15" }, { revoked_at: "2026-11-15" }, { unexpired: 0 },
    { is_banned: 1 }, ...["teacher", "parent", "admin", "dev"].map((student_role) => ({ student_role })),
  ]) {
    const f = fixture([{ ...active, ...patch }]);
    assert.deepEqual(await getParentInvite(token, f.deps), { valid: false });
    assert.equal(f.released(), true);
  }
});

test("database and connection errors expose no internal details", async () => {
  const f = fixture([], true);
  assert.deepEqual(await getParentInvite(token, f.deps), { valid: false });
  assert.equal(f.released(), true);
  assert.deepEqual(await getParentInvite(token, { getConnection: async () => {
    throw new Error("private credentials");
  } }), { valid: false });
});
