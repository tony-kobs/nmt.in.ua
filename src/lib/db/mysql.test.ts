import assert from "node:assert/strict";
import test from "node:test";
import { shouldPingIdleConnection, shouldRetryConnectError } from "./mysql";

/**
 * Regression test for the diagnostic-intro "stuck on Готуємо тест…" bug:
 * `acquireRawConnection` used to retry a connect-phase timeout (host
 * unreachable — a firewall silently dropping packets, a DB that's down but
 * still routable) `MAX_CONNECT_ATTEMPTS` times at the *full* `connectTimeout`
 * each, multiplying a single ~15s stall into a ~45s one (at the defaults)
 * before any error ever reached the client. An actively-refused connection
 * (ECONNREFUSED) or a dropped idle socket (ECONNRESET) fails fast and is
 * still worth retrying — only a connect-phase timeout isn't, since retrying
 * repeats the exact same wait for no benefit.
 */

test("does not retry a connect-phase timeout (host unreachable)", () => {
  assert.equal(
    shouldRetryConnectError({ code: "ETIMEDOUT" }, 1, 3),
    false,
  );
});

test("still retries a dropped-idle-socket error while attempts remain", () => {
  assert.equal(
    shouldRetryConnectError({ code: "ECONNRESET" }, 1, 3),
    true,
  );
  assert.equal(
    shouldRetryConnectError({ code: "PROTOCOL_CONNECTION_LOST" }, 2, 3),
    true,
  );
});

test("still retries a refused connection while attempts remain", () => {
  assert.equal(
    shouldRetryConnectError({ code: "ECONNREFUSED" }, 1, 3),
    true,
  );
});

test("never retries once the attempt budget is exhausted, regardless of error kind", () => {
  assert.equal(
    shouldRetryConnectError({ code: "ECONNRESET" }, 3, 3),
    false,
  );
});

test("never retries a non-transient error", () => {
  assert.equal(
    shouldRetryConnectError({ code: "ER_ACCESS_DENIED_ERROR" }, 1, 3),
    false,
  );
});

/**
 * A `ping` before every query costs a full round trip. While a student answers
 * question after question the pooled socket is handed back and taken again
 * within milliseconds, so it can only be dead if the host dropped it while
 * idle — which is what the threshold checks for.
 */
test("skips the ping for a socket released moments ago", () => {
  assert.equal(shouldPingIdleConnection(10_000, 10_500, 10_000), false);
});

test("pings a socket that sat idle past the threshold", () => {
  assert.equal(shouldPingIdleConnection(10_000, 20_000, 10_000), true);
  assert.equal(shouldPingIdleConnection(10_000, 45_000, 10_000), true);
});

test("skips the ping for a freshly opened connection", () => {
  assert.equal(shouldPingIdleConnection(undefined, 99_999, 10_000), false);
});

test("a zero threshold keeps pinging every reused socket", () => {
  assert.equal(shouldPingIdleConnection(500, 500, 0), true);
});
