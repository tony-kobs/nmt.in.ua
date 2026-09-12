import assert from "node:assert/strict";
import test from "node:test";

import {
  SESSION_MAX_AGE_SEC,
  createRenewedSessionToken,
  createSessionToken,
  verifySessionToken,
} from "./sessionToken";

const NOW = 1_700_000_000;

test("createSessionToken and verifySessionToken round-trip", async () => {
  const token = await createSessionToken(
    {
      userId: 3,
      role: "admin",
      displayName: "Адміністратор",
      login: "demo-admin",
    },
    NOW,
  );
  const payload = await verifySessionToken(token, NOW);
  assert.deepEqual(payload, {
    userId: 3,
    role: "admin",
    displayName: "Адміністратор",
    login: "demo-admin",
    exp: NOW + SESSION_MAX_AGE_SEC,
  });
});

test("verifySessionToken rejects expired tokens", async () => {
  const token = await createSessionToken(
    {
      userId: 1,
      role: "student",
      displayName: "Олена",
      login: "demo-student",
    },
    NOW,
  );
  const payload = await verifySessionToken(token, NOW + SESSION_MAX_AGE_SEC);
  assert.equal(payload, null);
});

test("verifySessionToken rejects tampered tokens", async () => {
  const token = await createSessionToken(
    {
      userId: 1,
      role: "student",
      displayName: "Олена",
      login: "demo-student",
    },
    NOW,
  );
  const tampered = `${token}x`;
  assert.equal(await verifySessionToken(tampered, NOW), null);
});

test("createSessionToken round-trips an optional avatarRev", async () => {
  const token = await createSessionToken(
    {
      userId: 4,
      role: "student",
      displayName: "Марія",
      login: "maria_k",
      avatarRev: 1_700_000_111,
    },
    NOW,
  );
  const payload = await verifySessionToken(token, NOW);
  assert.equal(payload?.avatarRev, 1_700_000_111);
});

test("createSessionToken omits avatarRev when the user has no photo", async () => {
  const token = await createSessionToken(
    {
      userId: 4,
      role: "student",
      displayName: "Марія",
      login: "maria_k",
    },
    NOW,
  );
  const payload = await verifySessionToken(token, NOW);
  assert.equal(payload?.avatarRev, undefined);
});

test("createRenewedSessionToken carries forward the given exp, not now + SESSION_MAX_AGE_SEC", async () => {
  const originalExp = NOW - 10_000 + SESSION_MAX_AGE_SEC; // minted long before "now"
  const token = await createRenewedSessionToken(
    {
      userId: 4,
      role: "student",
      displayName: "Марія Оновлена",
      login: "maria_k",
      avatarRev: 42,
    },
    originalExp,
  );
  const payload = await verifySessionToken(token, NOW);
  assert.deepEqual(payload, {
    userId: 4,
    role: "student",
    displayName: "Марія Оновлена",
    login: "maria_k",
    avatarRev: 42,
    exp: originalExp,
  });
});

test("createRenewedSessionToken never grants a fresh 24h window", async () => {
  const originalExp = NOW + 5; // about to expire
  const token = await createRenewedSessionToken(
    { userId: 1, role: "student", displayName: "Олена", login: "demo-student" },
    originalExp,
  );

  // Still valid a moment later...
  assert.ok(await verifySessionToken(token, NOW));
  // ...but rejected once the *original* exp passes, unlike a fresh token.
  assert.equal(await verifySessionToken(token, originalExp), null);
});
