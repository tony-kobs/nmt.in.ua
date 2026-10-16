import assert from "node:assert/strict";
import test from "node:test";

import { isUserOnline, ONLINE_THRESHOLD_MS } from "./presence";

test("isUserOnline is false without a timestamp", () => {
  assert.equal(isUserOnline(null), false);
  assert.equal(isUserOnline(undefined), false);
  assert.equal(isUserOnline(""), false);
});

test("isUserOnline is true inside the threshold window", () => {
  const now = Date.UTC(2026, 8, 16, 12, 0, 0);
  const recent = new Date(now - ONLINE_THRESHOLD_MS + 1_000).toISOString();
  assert.equal(isUserOnline(recent, now), true);
});

test("isUserOnline is false after the threshold", () => {
  const now = Date.UTC(2026, 8, 16, 12, 0, 0);
  const stale = new Date(now - ONLINE_THRESHOLD_MS - 1_000).toISOString();
  assert.equal(isUserOnline(stale, now), false);
});

test("isUserOnline is false when the stamp is in the future", () => {
  const now = Date.UTC(2026, 8, 16, 12, 0, 0);
  const ahead = new Date(now + 60 * 60 * 1000).toISOString();
  assert.equal(isUserOnline(ahead, now), false);
});
