import assert from "node:assert/strict";
import test from "node:test";

import { liveUserFromAccount } from "./getCurrentUser";
import type { AuthUser } from "./types";

const cookie: AuthUser = {
  id: 4,
  login: "old-login",
  displayName: "З cookie",
  role: "student",
};

const account: AuthUser = {
  id: 4,
  login: "db-login",
  displayName: "З бази",
  role: "teacher",
  cabinetScope: "full",
  email: "teacher@example.com",
  emailVerified: true,
  isBanned: false,
};

test("liveUserFromAccount overlays role from the database", () => {
  const decision = liveUserFromAccount(cookie, account);
  assert.equal(decision.ok, true);
  if (!decision.ok) return;
  assert.equal(decision.user.role, "teacher");
  assert.equal(decision.user.realRole, "teacher");
  assert.equal(decision.user.login, "db-login");
  assert.equal(decision.user.displayName, "З бази");
  assert.equal(decision.user.isBanned, false);
});

test("liveUserFromAccount rejects a banned account", () => {
  assert.deepEqual(liveUserFromAccount(cookie, { ...account, isBanned: true }), {
    ok: false,
    reason: "banned",
  });
});

test("a staff view downgrades the effective role and keeps the stored role", () => {
  const decision = liveUserFromAccount(
    { ...cookie, role: "student" },
    { ...account, role: "admin" },
    "student",
  );
  assert.equal(decision.ok, true);
  if (!decision.ok) return;
  assert.equal(decision.user.role, "student");
  assert.equal(decision.user.realRole, "admin");
});

test("a student cookie cannot become staff, and a developer cannot become admin", () => {
  const student = liveUserFromAccount(
    { ...cookie, role: "admin" },
    { ...account, role: "student" },
    "teacher",
  );
  assert.equal(student.ok, true);
  if (!student.ok) return;
  assert.equal(student.user.role, "student");
  assert.equal(student.user.realRole, "student");

  const developer = liveUserFromAccount(
    { ...cookie, role: "admin" },
    { ...account, role: "dev" },
    "admin",
  );
  assert.equal(developer.ok, true);
  if (!developer.ok) return;
  assert.equal(developer.user.role, "dev");
  assert.equal(developer.user.realRole, "dev");
});

test("liveUserFromAccount rejects a missing account", () => {
  assert.deepEqual(liveUserFromAccount(cookie, null), {
    ok: false,
    reason: "missing",
  });
});
