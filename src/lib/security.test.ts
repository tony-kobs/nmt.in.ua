import assert from "node:assert/strict";
import test from "node:test";

import {
  clientIp,
  looksLikeIp,
  readTrustedProxyHops,
} from "./security";

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

test("looksLikeIp accepts common IPv4 and IPv6 forms", () => {
  assert.equal(looksLikeIp("203.0.113.9"), true);
  assert.equal(looksLikeIp("127.0.0.1"), true);
  assert.equal(looksLikeIp("2001:db8::1"), true);
  assert.equal(looksLikeIp(""), false);
  assert.equal(looksLikeIp("not-an-ip"), false);
  assert.equal(looksLikeIp("999.1.1.1"), false);
});

test("readTrustedProxyHops defaults: prod=1, dev=0", () => {
  assert.equal(readTrustedProxyHops({ NODE_ENV: "production" }), 1);
  assert.equal(readTrustedProxyHops({ NODE_ENV: "development" }), 0);
  assert.equal(readTrustedProxyHops({ TRUSTED_PROXY_HOPS: "2" }), 2);
  assert.equal(readTrustedProxyHops({ TRUSTED_PROXY_HOPS: "0" }), 0);
});

test("clientIp prefers CF-Connecting-IP over spoofed X-Forwarded-For", () => {
  const ip = clientIp(
    headers({
      "x-forwarded-for": "1.2.3.4",
      "cf-connecting-ip": "198.51.100.10",
    }),
    { NODE_ENV: "production" },
  );
  assert.equal(ip, "198.51.100.10");
});

test("clientIp prefers X-Real-IP over leftmost X-Forwarded-For spoof", () => {
  const ip = clientIp(
    headers({
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
      "x-real-ip": "203.0.113.50",
    }),
    { NODE_ENV: "production" },
  );
  assert.equal(ip, "203.0.113.50");
});

test("clientIp with hops=1 takes the rightmost X-Forwarded-For entry", () => {
  // Attacker spoof + proxy-appended real peer.
  const ip = clientIp(
    headers({
      "x-forwarded-for": "1.2.3.4, 203.0.113.9",
    }),
    { NODE_ENV: "production", TRUSTED_PROXY_HOPS: "1" },
  );
  assert.equal(ip, "203.0.113.9");
});

test("clientIp with hops=0 ignores X-Forwarded-For entirely", () => {
  const ip = clientIp(
    headers({
      "x-forwarded-for": "1.2.3.4",
    }),
    { NODE_ENV: "development", TRUSTED_PROXY_HOPS: "0" },
  );
  assert.equal(ip, "unknown");
});

test("clientIp single overwritten X-Forwarded-For is accepted when hops>=1", () => {
  // nginx proxy_set_header X-Forwarded-For $remote_addr;
  const ip = clientIp(
    headers({
      "x-forwarded-for": "203.0.113.9",
    }),
    { TRUSTED_PROXY_HOPS: "1" },
  );
  assert.equal(ip, "203.0.113.9");
});

test("clientIp returns unknown when no usable headers", () => {
  assert.equal(clientIp(headers({}), { TRUSTED_PROXY_HOPS: "1" }), "unknown");
});
