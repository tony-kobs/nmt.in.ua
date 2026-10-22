import assert from "node:assert/strict";
import test from "node:test";

import {
  LIMIT_API_ACTOR,
  LIMIT_API_IP,
  LIMIT_AUTH_IP,
  LIMIT_PAGE_ACTOR,
  LIMIT_PAGE_IP,
  budgetCharges,
  isUncountedRequest,
  takeCharges,
  type BudgetBucket,
} from "./requestBudget";

const ip = "203.0.113.9";

function headers(init: Record<string, string> = {}): Headers {
  return new Headers(init);
}

test("prefetch, next chunks, and public files are not counted", () => {
  assert.equal(
    isUncountedRequest("GET", "/tasks/11", headers({ "next-router-prefetch": "1" })),
    true,
  );
  assert.equal(
    isUncountedRequest("GET", "/", headers({ purpose: "prefetch" })),
    true,
  );
  assert.equal(
    isUncountedRequest("POST", "/tasks/11", headers({ "next-router-prefetch": "1" })),
    false,
  );
  assert.equal(isUncountedRequest("GET", "/_next/static/chunk.js", headers()), true);
  assert.equal(isUncountedRequest("GET", "/landing/hero.webp", headers()), true);
  assert.equal(isUncountedRequest("GET", "/tasks/11", headers()), false);
});

test("signed-in page traffic is per user plus a class-sized IP ceiling", () => {
  const charges = budgetCharges({
    method: "GET",
    pathname: "/tasks/11",
    headers: headers(),
    ip,
    userId: 7,
  });
  assert.deepEqual(charges, [
    { key: "page:user:7", limit: LIMIT_PAGE_ACTOR },
    { key: `page:ip:${ip}`, limit: LIMIT_PAGE_IP },
  ]);
});

test("a guest page cannot spend the class ceiling", () => {
  const charges = budgetCharges({
    method: "GET",
    pathname: "/welcome",
    headers: headers(),
    ip,
    userId: null,
  });
  assert.deepEqual(charges, [{ key: `page:guest:${ip}`, limit: LIMIT_PAGE_ACTOR }]);
});

test("login stays a tight per-IP limit and does not share the page bucket", () => {
  const charges = budgetCharges({
    method: "POST",
    pathname: "/login",
    headers: headers(),
    ip,
    userId: null,
  });
  assert.deepEqual(charges, [{ key: `auth:ip:${ip}`, limit: LIMIT_AUTH_IP }]);
});

test("presence is per user; a webhook only hits the IP ceiling", () => {
  assert.deepEqual(
    budgetCharges({
      method: "POST",
      pathname: "/api/presence",
      headers: headers(),
      ip,
      userId: 7,
    }),
    [
      { key: "api:user:7", limit: LIMIT_API_ACTOR },
      { key: `api:ip:${ip}`, limit: LIMIT_API_IP },
    ],
  );
  for (const pathname of [
    "/api/payments/wayforpay/webhook",
    "/api/marathon/notifications/process",
    "/api/marathon/notifications/health",
  ]) {
    assert.deepEqual(
      budgetCharges({
        method: pathname.endsWith("/health") ? "GET" : "POST",
        pathname,
        headers: headers(),
        ip,
        userId: null,
      }),
      [{ key: `api:ip:${ip}`, limit: LIMIT_API_IP }],
    );
  }
});

test("two students on one IP each get 180 page hits", () => {
  const buckets = new Map<string, BudgetBucket>();
  const now = 1_000_000;
  for (const userId of [1, 2]) {
    for (let i = 0; i < LIMIT_PAGE_ACTOR; i += 1) {
      const result = takeCharges(
        buckets,
        budgetCharges({
          method: "GET",
          pathname: "/tasks/11",
          headers: headers(),
          ip,
          userId,
        }),
        now,
      );
      assert.equal(result.ok, true);
    }
  }
  const blocked = takeCharges(
    buckets,
    budgetCharges({
      method: "GET",
      pathname: "/tasks/11",
      headers: headers(),
      ip,
      userId: 1,
    }),
    now,
  );
  assert.equal(blocked.ok, false);
  const other = takeCharges(
    buckets,
    budgetCharges({
      method: "GET",
      pathname: "/",
      headers: headers(),
      ip,
      userId: 2,
    }),
    now,
  );
  assert.equal(other.ok, false);
});

test("a full personal budget does not consume the other student's slot", () => {
  const buckets = new Map<string, BudgetBucket>();
  const now = 1_000_000;
  for (let i = 0; i < LIMIT_PAGE_ACTOR; i += 1) {
    takeCharges(
      buckets,
      budgetCharges({
        method: "GET",
        pathname: "/tasks/11",
        headers: headers(),
        ip,
        userId: 1,
      }),
      now,
    );
  }
  const second = takeCharges(
    buckets,
    budgetCharges({
      method: "GET",
      pathname: "/tasks/11",
      headers: headers(),
      ip,
      userId: 2,
    }),
    now,
  );
  assert.equal(second.ok, true);
});

test("prefetch does not spend the page budget", () => {
  const buckets = new Map<string, BudgetBucket>();
  const now = 1_000_000;
  for (let i = 0; i < 500; i += 1) {
    const result = takeCharges(
      buckets,
      budgetCharges({
        method: "GET",
        pathname: "/tasks/11",
        headers: headers({ "next-router-prefetch": "1" }),
        ip,
        userId: 7,
      }),
      now,
    );
    assert.equal(result.ok, true);
  }
  assert.equal(buckets.size, 0);
});
