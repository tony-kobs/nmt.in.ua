import assert from "node:assert/strict";
import test from "node:test";

import { registerTeacherAction, type RegisterActionState } from "./actions";
import { CreateUserError } from "./users";

const IDLE: RegisterActionState = { status: "idle" };

function formDataWith(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

test("registerTeacherAction returns validation error without creating a user", async () => {
  const state = await registerTeacherAction(
    IDLE,
    formDataWith({
      login: "ab",
      displayName: "Ok Name",
      password: "12345678",
      passwordConfirm: "12345678",
    }),
  );
  assert.deepEqual(state, { status: "error", code: "invalidLogin" });
});

test("registerTeacherAction maps reserved demo login", async () => {
  const state = await registerTeacherAction(
    IDLE,
    formDataWith({
      login: "demo-teacher",
      displayName: "Someone",
      password: "12345678",
      passwordConfirm: "12345678",
    }),
  );
  assert.deepEqual(state, { status: "error", code: "reservedLogin" });
  assert.ok(CreateUserError);
});
