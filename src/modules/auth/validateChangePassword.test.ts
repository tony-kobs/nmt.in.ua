import assert from "node:assert/strict";
import test from "node:test";
import { validateChangePasswordInput } from "./validateChangePassword";

test("validateChangePasswordInput accepts a valid payload", () => {
  const result = validateChangePasswordInput({
    currentPassword: "oldpass12",
    newPassword: "newpass12",
    newPasswordConfirm: "newpass12",
  });
  assert.deepEqual(result, {
    ok: true,
    value: { currentPassword: "oldpass12", newPassword: "newpass12" },
  });
});

test("validateChangePasswordInput rejects empty fields", () => {
  const result = validateChangePasswordInput({
    currentPassword: "",
    newPassword: "newpass12",
    newPasswordConfirm: "newpass12",
  });
  assert.deepEqual(result, { ok: false, code: "requiredFields" });
});

test("validateChangePasswordInput rejects a short new password", () => {
  const result = validateChangePasswordInput({
    currentPassword: "oldpass12",
    newPassword: "short",
    newPasswordConfirm: "short",
  });
  assert.deepEqual(result, { ok: false, code: "passwordTooShort" });
});

test("validateChangePasswordInput rejects a mismatch", () => {
  const result = validateChangePasswordInput({
    currentPassword: "oldpass12",
    newPassword: "newpass12",
    newPasswordConfirm: "newpass99",
  });
  assert.deepEqual(result, { ok: false, code: "passwordMismatch" });
});

test("validateChangePasswordInput rejects the same password", () => {
  const result = validateChangePasswordInput({
    currentPassword: "samepass1",
    newPassword: "samepass1",
    newPasswordConfirm: "samepass1",
  });
  assert.deepEqual(result, { ok: false, code: "samePassword" });
});
