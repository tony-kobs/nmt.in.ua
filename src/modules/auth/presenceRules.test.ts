import assert from "node:assert/strict";
import test from "node:test";

import {
  ONLINE_WINDOW_MS,
  isLivePresence,
  onlineSessionExistsSql,
  presenceAgo,
} from "./presenceRules";

const NOW = Date.parse("2026-10-16T12:00:00.000Z");

test("isLivePresence requires an open unexpired session inside the window", () => {
  const live = {
    revoked: false,
    expiresAtMs: NOW + 60_000,
    lastSeenAtMs: NOW - 60_000,
    nowMs: NOW,
  };
  assert.equal(isLivePresence(live), true);
  assert.equal(isLivePresence({ ...live, revoked: true }), false);
  assert.equal(
    isLivePresence({ ...live, expiresAtMs: NOW - 1 }),
    false,
  );
  assert.equal(
    isLivePresence({ ...live, lastSeenAtMs: NOW - ONLINE_WINDOW_MS - 1 }),
    false,
  );
  assert.equal(isLivePresence({ ...live, lastSeenAtMs: null }), false);
});

test("isLivePresence rejects a last_seen that sits in the future", () => {
  assert.equal(
    isLivePresence({
      revoked: false,
      expiresAtMs: NOW + 3_600_000,
      lastSeenAtMs: NOW + 3 * 60 * 60 * 1000,
      nowMs: NOW,
    }),
    false,
  );
});

test("presenceAgo uses the shared relative buckets", () => {
  assert.deepEqual(presenceAgo(null), { kind: "never" });
  assert.deepEqual(presenceAgo(0), { kind: "just" });
  assert.deepEqual(presenceAgo(4), { kind: "minutes", count: 4 });
  assert.deepEqual(presenceAgo(60), { kind: "hours", count: 1 });
  assert.deepEqual(presenceAgo(125), { kind: "hours", count: 2 });
  assert.deepEqual(presenceAgo(49 * 60), { kind: "days", count: 2 });
  assert.deepEqual(presenceAgo(30 * 24 * 60), { kind: "months", count: 1 });
});

test("online session SQL excludes revoked and expired rows", () => {
  const sql = onlineSessionExistsSql("app_users.id");
  assert.match(sql, /revoked_at IS NULL/);
  assert.match(sql, /expires_at > CURRENT_TIMESTAMP/);
  assert.match(sql, /INTERVAL 5 MINUTE/);
});
