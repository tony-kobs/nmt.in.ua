import assert from "node:assert/strict";
import test from "node:test";

import { loginAction, type LoginActionState } from "./actions";
import { hashPassword } from "./password";
import type { AuthUser } from "./types";

const IDLE: LoginActionState = { status: "idle" };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function account(patch: Partial<AuthUser> & { passwordHash?: string } = {}) {
  return {
    id: 7,
    login: "olenka",
    displayName: "Оленка",
    role: "student" as const,
    email: "olenka@example.com",
    emailVerified: true,
    emailVerifyRequired: false,
    isBanned: false,
    passwordHash: hashPassword("correct-horse"),
    ...patch,
  };
}

test("loginAction asks for both fields when they are empty", async () => {
  const state = await loginAction(IDLE, form({ email: "", password: "" }));
  assert.deepEqual(state, { status: "error", code: "requiredFields" });
});

test("loginAction rejects a password that does not match", async () => {
  const state = await loginAction(
    IDLE,
    form({ email: "olenka@example.com", password: "wrong-password" }),
    {
      findUserByEmail: async () => account(),
      cancelDeletion: async () => undefined,
    },
  );
  assert.deepEqual(state, { status: "error", code: "invalidCredentials" });
});

test("loginAction rejects a banned account before opening a session", async () => {
  let opened = false;
  const state = await loginAction(
    IDLE,
    form({ email: "olenka@example.com", password: "correct-horse" }),
    {
      findUserByEmail: async () => account({ isBanned: true }),
      setSessionCookie: async () => {
        opened = true;
      },
      cancelDeletion: async () => undefined,
      recordLoginPresence: async () => undefined,
    },
  );
  assert.deepEqual(state, { status: "error", code: "accountBanned" });
  assert.equal(opened, false);
});

test("loginAction keeps an unverified self-signup out", async () => {
  const state = await loginAction(
    IDLE,
    form({ email: "olenka@example.com", password: "correct-horse" }),
    {
      findUserByEmail: async () =>
        account({ emailVerified: false, emailVerifyRequired: true }),
      cancelDeletion: async () => undefined,
      recordLoginPresence: async () => undefined,
    },
  );
  assert.deepEqual(state, { status: "error", code: "emailUnverified" });
});

test("loginAction opens a session and redirects on success", async () => {
  let cookieUser = 0;
  const state = await loginAction(
    IDLE,
    form({ email: "olenka@example.com", password: "correct-horse", next: "/topic" }),
    {
      findUserByEmail: async () => account(),
      recordLoginPresence: async () => undefined,
      cancelDeletion: async () => undefined,
      setSessionCookie: async (user) => {
        cookieUser = user.id;
      },
      redirectTo: (path) => {
        throw new Error(`redirect:${path}`);
      },
    },
  ).catch((error: unknown) => error);
  assert.ok(state instanceof Error);
  assert.equal(state.message, "redirect:/topic");
  assert.equal(cookieUser, 7);
});
