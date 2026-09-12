import assert from "node:assert/strict";
import test from "node:test";
import {
  SESSION_LIFETIME_SEC,
  computeSessionDeadline,
  isSessionExpired,
} from "./sessionExpiry";

test("SESSION_LIFETIME_SEC is exactly 24 hours", () => {
  assert.equal(SESSION_LIFETIME_SEC, 86400);
});

test("computeSessionDeadline adds exactly 86400 seconds", () => {
  const now = 1_700_000_000;
  assert.equal(computeSessionDeadline(now), now + 86400);
});

test("isSessionExpired: not yet at the deadline", () => {
  const now = 1_700_000_000;
  const deadline = now + 86400;
  assert.equal(isSessionExpired(deadline, deadline - 1), false);
});

test("isSessionExpired: exactly at the deadline counts as expired", () => {
  const deadline = 1_700_086_400;
  assert.equal(isSessionExpired(deadline, deadline), true);
});

test("isSessionExpired: past the deadline", () => {
  const deadline = 1_700_086_400;
  assert.equal(isSessionExpired(deadline, deadline + 1), true);
});

test("isSessionExpired fails closed on a missing deadline", () => {
  assert.equal(isSessionExpired(null, 1_700_000_000), true);
  assert.equal(isSessionExpired(undefined, 1_700_000_000), true);
});

test("isSessionExpired fails closed on a zero or invalid deadline", () => {
  assert.equal(isSessionExpired(0, 1_700_000_000), true);
  assert.equal(isSessionExpired(-1, 1_700_000_000), true);
  assert.equal(isSessionExpired(Number.NaN, 1_700_000_000), true);
});
