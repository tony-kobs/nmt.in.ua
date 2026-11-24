import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { hashAuthToken } from "@/modules/auth/authTokens";
import { verifyPassword } from "@/modules/auth/password";
import { registerParentFromInvite } from "./registerParentFromInvite";

const token = randomBytes(32).toString("base64url");
const form = { token, email: "Parent@example.com", displayName: " Parent   Name ",
  password: "test-password-123", passwordConfirm: "test-password-123" };

function fixture(options: {
  missing?: boolean; used?: boolean; revoked?: boolean; expired?: boolean;
  studentRole?: string; banned?: number; missingStudent?: boolean;
  duplicateEmail?: boolean; duplicateLogin?: boolean;
  fail?: "link" | "update" | "commit";
  mail?: "fail" | "throw";
} = {}) {
  const users: unknown[][] = [];
  const links: unknown[][] = [];
  const events: string[] = [];
  let used = options.used ?? false;
  let nextId = 100;
  let duplicateLogin = options.duplicateLogin ?? false;
  let queue = Promise.resolve();
  let acquired = 0;
  let mailCount = 0;
  const deps = {
    getConnection: async (): Promise<SqlConnection> => {
      acquired++;
      let unlock: (() => void) | undefined;
      let pendingUser: unknown[] | undefined;
      let pendingLink: unknown[] | undefined;
      let pendingUsed = false;
      const releaseLock = () => { unlock?.(); unlock = undefined; };
      return {
        beginTransaction: async () => { events.push("begin"); },
        query: async <T,>(sql: string, params: unknown[] = []): Promise<T[]> => {
          if (sql.includes("FROM app_users")) {
            assert.match(sql, /FOR UPDATE/);
            assert.deepEqual(params, [17]);
            const prior = queue;
            queue = new Promise<void>((resolve) => { unlock = resolve; });
            await prior;
            events.push("student-lock");
            return (options.missingStudent ? [] : [{ role: options.studentRole ?? "student", is_banned: options.banned ?? 0 }]) as T[];
          }
          assert.deepEqual(params, [hashAuthToken(token)]);
          if (!sql.includes("FOR UPDATE")) {
            assert.equal(unlock, undefined);
            return (options.missing ? [] : [{ student_user_id: 17 }]) as T[];
          }
          assert.ok(unlock, "Student must be locked before the invitation");
          events.push("invite-lock");
          return [{ id: 29, student_user_id: 17, used_at: used ? "used" : null,
            revoked_at: options.revoked ? "revoked" : null, unexpired: options.expired ? 0 : 1 }] as T[];
        },
        execute: async (sql, params = []) => {
          if (sql.includes("INSERT INTO app_users")) {
            if (options.duplicateEmail) throw { errno: 1062, message: "uq_app_users_email" };
            if (duplicateLogin) { duplicateLogin = false; throw { errno: 1062, message: "uq_app_users_login" }; }
            pendingUser = params;
            events.push("user");
            return { insertId: nextId++, affectedRows: 1 };
          }
          if (sql.includes("INSERT INTO parent_students")) {
            if (options.fail === "link") throw new Error("link failure");
            pendingLink = params;
            events.push("link");
            return { insertId: 0, affectedRows: 1 };
          }
          assert.match(sql, /UPDATE parent_invites/);
          assert.match(sql, /expires_at > CURRENT_TIMESTAMP/);
          assert.deepEqual(params, [nextId - 1, 29]);
          if (options.fail === "update") return { insertId: 0, affectedRows: 0 };
          pendingUsed = true;
          events.push("consume");
          return { insertId: 0, affectedRows: 1 };
        },
        commit: async () => {
          if (options.fail === "commit") throw new Error("commit failure");
          if (pendingUser) users.push(pendingUser);
          if (pendingLink) links.push(pendingLink);
          used = used || pendingUsed;
          events.push("commit");
          releaseLock();
        },
        rollback: async () => {
          pendingUser = undefined; pendingLink = undefined; pendingUsed = false;
          events.push("rollback"); releaseLock();
        },
        release: () => { events.push("release"); releaseLock(); },
      };
    },
    sendVerificationMail: async (input: { userId: number; email: string; displayName: string }) => {
      assert.ok(events.includes("commit"), "Mail must follow commit");
      assert.equal(input.email, "parent@example.com");
      assert.equal(input.displayName, "Parent Name");
      mailCount++;
      events.push("mail");
      if (options.mail === "throw") throw new Error("mail unavailable");
      return { ok: options.mail !== "fail" };
    },
  };
  return { deps, users, links, events, used: () => used, acquired: () => acquired, mailCount: () => mailCount };
}

test("registers parent with the shared password hash and atomic link/consume, then sends email", async () => {
  const f = fixture();
  assert.deepEqual(await registerParentFromInvite({ ...form, role: "admin", studentId: 999 }, f.deps), {
    status: "success", email: "parent@example.com", verificationSent: true,
  });
  assert.equal(f.users.length, 1);
  const user = f.users[0];
  assert.equal(user[3], "parent");
  assert.equal(user[4], "parent@example.com");
  assert.equal(user[5], 1, "Email verification must remain required");
  assert.ok(verifyPassword(form.password, String(user[1])));
  assert.deepEqual(f.links, [[100, 17]]);
  assert.equal(f.used(), true);
  assert.deepEqual(f.events, ["begin", "student-lock", "invite-lock", "user", "link", "consume", "commit", "release", "mail"]);
});

test("invalid token or form is rejected before acquiring a connection", async () => {
  for (const patch of [{ token: "bad" }, { email: "bad" }, { passwordConfirm: "mismatch" }, { displayName: "" }]) {
    const f = fixture();
    assert.equal((await registerParentFromInvite({ ...form, ...patch }, f.deps)).status, "error");
    assert.equal(f.acquired(), 0);
  }
});

test("missing, used, revoked, expired and inactive-student invitations never create an account", async () => {
  for (const options of [{ missing: true }, { used: true }, { revoked: true }, { expired: true },
    { studentRole: "parent" }, { banned: 1 }, { missingStudent: true }]) {
    const f = fixture(options);
    assert.deepEqual(await registerParentFromInvite(form, f.deps), { status: "error", code: "invalidInvite" });
    assert.equal(f.users.length, 0);
    assert.equal(f.mailCount(), 0);
    if (!options.missing) assert.ok(f.events.includes("rollback"));
  }
});

test("existing email is not attached and leaves invitation available", async () => {
  const f = fixture({ duplicateEmail: true });
  assert.deepEqual(await registerParentFromInvite(form, f.deps), { status: "error", code: "emailTaken" });
  assert.equal(f.used(), false);
  assert.equal(f.users.length, 0);
  assert.equal(f.links.length, 0);
  assert.equal(f.mailCount(), 0);
  assert.ok(f.events.includes("rollback"));
});

test("login collisions try the next generated login within the same transaction", async () => {
  const f = fixture({ duplicateLogin: true });
  assert.equal((await registerParentFromInvite(form, f.deps)).status, "success");
  assert.equal(f.users[0][0], "parent2");
});

test("link, consumption and commit failures roll back the whole registration", async () => {
  for (const fail of ["link", "update", "commit"] as const) {
    const f = fixture({ fail });
    assert.deepEqual(await registerParentFromInvite(form, f.deps), { status: "error", code: "serverError" });
    assert.equal(f.users.length, 0);
    assert.equal(f.links.length, 0);
    assert.equal(f.used(), false);
    assert.equal(f.mailCount(), 0);
    assert.ok(f.events.includes("rollback"));
  }
});

test("reusing the invitation cannot register a second account", async () => {
  const f = fixture();
  assert.equal((await registerParentFromInvite(form, f.deps)).status, "success");
  assert.deepEqual(await registerParentFromInvite(form, f.deps), { status: "error", code: "invalidInvite" });
  assert.equal(f.users.length, 1);
  assert.equal(f.mailCount(), 1);
});

test("simultaneous token redemption only creates one account and link", async () => {
  const f = fixture();
  const results = await Promise.all([
    registerParentFromInvite(form, f.deps), registerParentFromInvite(form, f.deps),
  ]);
  assert.equal(results.filter((r) => r.status === "success").length, 1);
  assert.equal(results.filter((r) => r.status === "error" && r.code === "invalidInvite").length, 1);
  assert.equal(f.users.length, 1);
  assert.equal(f.links.length, 1);
  assert.equal(f.mailCount(), 1);
});

test("mail failure keeps the committed registration for the existing resend flow", async () => {
  for (const mail of ["fail", "throw"] as const) {
    const f = fixture({ mail });
    assert.deepEqual(await registerParentFromInvite(form, f.deps), {
      status: "success", email: "parent@example.com", verificationSent: false,
    });
    assert.equal(f.users.length, 1);
    assert.equal(f.used(), true);
    assert.ok(!f.events.includes("rollback"));
  }
});
