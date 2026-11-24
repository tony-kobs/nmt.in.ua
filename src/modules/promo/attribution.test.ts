import assert from "node:assert/strict";
import test from "node:test";

import { applySignupAttribution } from "./attribution";

test("signup applies a promo and a ref, then clears the cookies", async () => {
  const cleared = { count: 0 };
  const result = await applySignupAttribution(5, {
    readCookies: async () => ({ promo: "OPENDAY", ref: "maria" }),
    clearCookies: async () => {
      cleared.count += 1;
    },
    redeem: async () => ({
      ok: true,
      accessUntil: new Date("2026-07-01T00:00:00.000Z"),
      teacherLinked: true,
      teacherName: "Марія Коваль",
    }),
    resolveTeacher: async () => ({ id: 2, displayName: "Марія Коваль" }),
    linkTeacher: async () => true,
  });
  assert.deepEqual(result, { promo: "applied", teacher: "linked" });
  assert.equal(cleared.count, 1);
});

test("a dead code still links the teacher and does not keep the cookie", async () => {
  let cleared = false;
  const result = await applySignupAttribution(5, {
    readCookies: async () => ({ promo: "OLD", ref: "12" }),
    clearCookies: async () => {
      cleared = true;
    },
    redeem: async () => ({ ok: false, code: "expired" }),
    resolveTeacher: async (ref) => (ref === "12" ? { id: 12, displayName: "Ігор" } : null),
    linkTeacher: async () => false,
  });
  assert.deepEqual(result, { promo: "expired", teacher: "known" });
  assert.equal(cleared, true);
});

test("a server failure keeps the cookie for another try", async () => {
  let cleared = false;
  const result = await applySignupAttribution(5, {
    promo: "FROM-FORM",
    readCookies: async () => ({ promo: null, ref: null }),
    clearCookies: async () => {
      cleared = true;
    },
    redeem: async (input) => {
      assert.equal(input.code, "FROM-FORM");
      return { ok: false, code: "server" };
    },
  });
  assert.equal(result.promo, "server");
  assert.equal(cleared, false);
});

test("nothing is written when the visitor has no attribution", async () => {
  let redeemed = false;
  const result = await applySignupAttribution(5, {
    readCookies: async () => ({ promo: null, ref: null }),
    redeem: async () => {
      redeemed = true;
      return { ok: false, code: "invalid" };
    },
  });
  assert.deepEqual(result, { promo: "absent", teacher: "absent" });
  assert.equal(redeemed, false);
});
