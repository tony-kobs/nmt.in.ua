import assert from "node:assert/strict";
import test from "node:test";

import { GUEST_MAX_AGE_SEC, createGuestToken, verifyGuestToken } from "./guestToken";
import { createSessionToken, verifySessionToken } from "./sessionToken";

const NOW = 1_700_000_000;

test("createGuestToken and verifyGuestToken round-trip", async () => {
  const token = await createGuestToken("11111111-1111-1111-1111-111111111111", NOW);
  const payload = await verifyGuestToken(token, NOW);
  assert.deepEqual(payload, { guestId: "11111111-1111-1111-1111-111111111111" });
});

test("verifyGuestToken rejects expired tokens", async () => {
  const token = await createGuestToken("guest-a", NOW);
  const payload = await verifyGuestToken(token, NOW + GUEST_MAX_AGE_SEC);
  assert.equal(payload, null);
});

test("verifyGuestToken rejects a tampered signature", async () => {
  const token = await createGuestToken("guest-a", NOW);
  assert.equal(await verifyGuestToken(`${token}x`, NOW), null);
});

test("verifyGuestToken rejects a tampered payload", async () => {
  const token = await createGuestToken("guest-a", NOW);
  const [body, signature] = token.split(".");
  const forged = `${body}extra.${signature}`;
  assert.equal(await verifyGuestToken(forged, NOW), null);
});

test("verifyGuestToken rejects a well-formed nmt_session token", async () => {
  const sessionToken = await createSessionToken(
    {
      userId: 1,
      role: "student",
      displayName: "Олена",
      login: "demo-student",
    },
    NOW,
  );
  assert.equal(await verifyGuestToken(sessionToken, NOW), null);
});

test("verifySessionToken rejects a well-formed nmt_guest token", async () => {
  const guestToken = await createGuestToken("guest-a", NOW);
  assert.equal(await verifySessionToken(guestToken, NOW), null);
});

test("verifyGuestToken rejects malformed tokens", async () => {
  assert.equal(await verifyGuestToken("not-a-token", NOW), null);
  assert.equal(await verifyGuestToken("", NOW), null);
});
