import assert from "node:assert/strict";
import test from "node:test";

import { loginClientIp, loginUserAgent } from "./loginIp";

function headers(init: Record<string, string>): { get(name: string): string | null } {
  const map = new Map(
    Object.entries(init).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return { get: (name) => map.get(name.toLowerCase()) ?? null };
}

test("loginClientIp uses the first X-Forwarded-For hop", () => {
  assert.equal(
    loginClientIp(
      headers({
        "x-forwarded-for": "203.0.113.9, 10.0.0.4",
        "x-real-ip": "198.51.100.8",
      }),
    ),
    "203.0.113.9",
  );
});

test("loginClientIp falls back to X-Real-IP when the first hop is not an address", () => {
  assert.equal(
    loginClientIp(
      headers({
        "x-forwarded-for": "unknown, 203.0.113.9",
        "x-real-ip": "198.51.100.8",
      }),
    ),
    "198.51.100.8",
  );
});

test("loginClientIp accepts a single nginx X-Forwarded-For overwrite", () => {
  assert.equal(
    loginClientIp(headers({ "x-forwarded-for": "203.0.113.50" })),
    "203.0.113.50",
  );
});

test("loginClientIp strips an IPv4 port and a v4-mapped prefix", () => {
  assert.equal(
    loginClientIp(headers({ "x-forwarded-for": "203.0.113.9:443" })),
    "203.0.113.9",
  );
  assert.equal(
    loginClientIp(headers({ "x-real-ip": "::ffff:203.0.113.9" })),
    "203.0.113.9",
  );
});

test("loginClientIp uses CF-Connecting-IP only as the last fallback", () => {
  assert.equal(
    loginClientIp(headers({ "cf-connecting-ip": "198.51.100.10" })),
    "198.51.100.10",
  );
  assert.equal(loginClientIp(headers({})), null);
});

test("loginUserAgent trims control characters and length", () => {
  assert.equal(loginUserAgent(headers({})), null);
  assert.equal(
    loginUserAgent(headers({ "user-agent": " Test\nAgent " })),
    "TestAgent",
  );
  const long = "A".repeat(300);
  assert.equal(loginUserAgent(headers({ "user-agent": long }))?.length, 255);
});
