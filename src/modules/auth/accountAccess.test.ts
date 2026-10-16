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

test("liveUserFromAccount rejects a missing account", () => {
  assert.deepEqual(liveUserFromAccount(cookie, null), {
    ok: false,
    reason: "missing",
  });
});
