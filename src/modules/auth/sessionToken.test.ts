import assert from "node:assert/strict";
import test from "node:test";

import {
  SESSION_MAX_AGE_SEC,
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
