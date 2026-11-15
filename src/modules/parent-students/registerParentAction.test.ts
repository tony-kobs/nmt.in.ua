import assert from "node:assert/strict";
import test from "node:test";
import { registerParentAction } from "./actions";
import { handleParentRegistration } from "./registerParentAction";

const values = { token: "test-token", displayName: "Parent", email: "parent@example.com",
  password: "test-password", passwordConfirm: "test-password" };
function form(extra: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ ...values, ...extra })) data.set(key, value);
  return data;
}
class Redirected extends Error {
  constructor(readonly path: string) { super("test redirect"); }
}
const redirectTo = (path: string): never => { throw new Redirected(path); };

test("public action delegates invalid forms to backend validation without a database", async () => {
  assert.deepEqual(await registerParentAction({ status: "idle" }, new FormData()), {
    status: "error", code: "invalidInvite",
  });
});

test("form adapter passes only credentials and token, ignoring role, identity and next", async () => {
  const result = await handleParentRegistration(form({ role: "admin", studentId: "999", next: "//remote.invalid" }), {
    register: async (input) => {
      assert.deepEqual(input, values);
      return { status: "error", code: "invalidInvite" };
    }, redirectTo,
  });
  assert.deepEqual(result, { status: "error", code: "invalidInvite" });
});

test("safe backend error codes are returned without extra backend fields", async () => {
  for (const code of ["invalidInvite", "emailTaken", "passwordMismatch", "invalidEmail", "serverError"] as const) {
    const result = await handleParentRegistration(form(), {
      register: async () => ({ status: "error", code, token: "private", sql: "private" }), redirectTo,
    });
    assert.deepEqual(result, { status: "error", code });
  }
});

test("backend exceptions return only serverError", async () => {
  const result = await handleParentRegistration(form(), {
    register: async () => { throw new Error("private SQL and token details"); }, redirectTo,
  });
  assert.deepEqual(result, { status: "error", code: "serverError" });
});

test("success and mail failure use existing email-confirmation flow with parent destination", async () => {
  for (const verificationSent of [true, false]) {
    await assert.rejects(handleParentRegistration(form({ next: "/settings" }), {
      register: async () => ({ status: "success", email: "parent+one@example.com", verificationSent }),
      redirectTo,
    }), (error: unknown) => {
      assert.ok(error instanceof Redirected);
      const url = new URL(error.path, "http://localhost:3000");
      assert.equal(url.pathname, "/register/check-email");
      assert.equal(url.searchParams.get("email"), "parent+one@example.com");
      assert.equal(url.searchParams.get("next"), "/parent");
      assert.equal(url.searchParams.get("mail"), verificationSent ? null : "failed");
      assert.equal(url.searchParams.has("token"), false);
      return true;
    });
  }
});

test("missing and file-valued fields become empty strings for backend validation", async () => {
  const data = new FormData();
  data.set("token", new Blob(["not a token"]), "token.txt");
  await handleParentRegistration(data, {
    register: async (input) => {
      assert.deepEqual(input, { token: "", displayName: "", email: "", password: "", passwordConfirm: "" });
      return { status: "error", code: "invalidInvite" };
    }, redirectTo,
  });
});
