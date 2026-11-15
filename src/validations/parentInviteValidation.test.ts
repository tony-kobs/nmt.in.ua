import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { validateParentInviteToken } from "./parentInviteValidation";

test("accepts generated 32-byte base64url tokens and trims surrounding whitespace", () => {
  for (let i = 0; i < 100; i++) {
    const token = randomBytes(32).toString("base64url");
    assert.deepEqual(validateParentInviteToken(` ${token}\n`), { ok: true, token });
  }
});

test("rejects missing, non-string, malformed and noncanonical tokens", () => {
  for (const token of [undefined, null, 123, {}, [], "", " ", "a".repeat(42),
    "a".repeat(44), "a".repeat(43), "+".repeat(42) + "A", "/".repeat(42) + "A",
    "a".repeat(42) + "=", "a".repeat(20) + " " + "a".repeat(21) + "A"]) {
    assert.deepEqual(validateParentInviteToken(token), { ok: false });
  }
});
