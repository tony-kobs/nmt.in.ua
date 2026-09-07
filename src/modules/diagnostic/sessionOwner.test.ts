import assert from "node:assert/strict";
import test from "node:test";

import { isValidOwner, ownerClause, ownerKey, ownerParams } from "./sessionOwner";

test("isValidOwner accepts a user owner", () => {
  assert.equal(isValidOwner({ userId: 1, guestToken: null }), true);
});

test("isValidOwner accepts a guest owner", () => {
  assert.equal(isValidOwner({ userId: null, guestToken: "guest-a" }), true);
});

test("isValidOwner rejects both set", () => {
  assert.equal(isValidOwner({ userId: 1, guestToken: "guest-a" }), false);
});

test("isValidOwner rejects neither set", () => {
  assert.equal(isValidOwner({ userId: null, guestToken: null }), false);
});

test("isValidOwner rejects a non-positive userId", () => {
  assert.equal(isValidOwner({ userId: 0, guestToken: null }), false);
  assert.equal(isValidOwner({ userId: -1, guestToken: null }), false);
});

test("isValidOwner rejects an empty guestToken", () => {
  assert.equal(isValidOwner({ userId: null, guestToken: "" }), false);
});

test("isValidOwner rejects garbage input", () => {
  assert.equal(isValidOwner(null), false);
  assert.equal(isValidOwner("owner"), false);
  assert.equal(isValidOwner(undefined), false);
});

test("ownerClause produces the two-branch WHERE fragment for the given alias", () => {
  const clause = ownerClause("ts");
  assert.match(clause, /ts\.user_id = \?/);
  assert.match(clause, /ts\.guest_token = \?/);
  assert.match(clause, /ts\.user_id IS NULL/);
});

test("ownerParams for a user owner never matches a guest row", () => {
  const params = ownerParams({ userId: 5, guestToken: null });
  assert.deepEqual(params, [5, 5, null, null]);
});

test("ownerParams for a guest owner never matches a different guest's rows", () => {
  const params = ownerParams({ userId: null, guestToken: "guest-a" });
  assert.deepEqual(params, [null, null, "guest-a", "guest-a"]);
});

test("ownerKey is stable and distinct per owner", () => {
  assert.equal(ownerKey({ userId: 7, guestToken: null }), "user:7");
  assert.equal(ownerKey({ userId: null, guestToken: "guest-a" }), "guest:guest-a");
  assert.notEqual(
    ownerKey({ userId: null, guestToken: "guest-a" }),
    ownerKey({ userId: null, guestToken: "guest-b" }),
  );
});
