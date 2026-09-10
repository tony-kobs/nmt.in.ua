import assert from "node:assert/strict";
import test from "node:test";

import { AVATAR_MAX_BYTES, sniffAvatarMime } from "./avatarConstants";
import { avatarSrc } from "./types";

function jpegBytes(length = 16): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  return bytes;
}

function pngBytes(): Uint8Array {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
  ]);
}

function webpBytes(): Uint8Array {
  const bytes = new Uint8Array(16);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  return bytes;
}

test("sniffAvatarMime accepts jpeg, png, and webp magic bytes", () => {
  assert.equal(sniffAvatarMime(jpegBytes()), "image/jpeg");
  assert.equal(sniffAvatarMime(pngBytes()), "image/png");
  assert.equal(sniffAvatarMime(webpBytes()), "image/webp");
});

test("sniffAvatarMime rejects svg, html, and truncated payloads", () => {
  assert.equal(sniffAvatarMime(new Uint8Array(8)), null);
  assert.equal(
    sniffAvatarMime(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'>")),
    null,
  );
  assert.equal(
    sniffAvatarMime(new TextEncoder().encode("<!doctype html><html></html>....")),
    null,
  );
});

test("AVATAR_MAX_BYTES stays well under a MEDIUMBLOB row", () => {
  assert.equal(AVATAR_MAX_BYTES, 512 * 1024);
});

test("avatarSrc is versioned when a revision exists", () => {
  assert.equal(avatarSrc({ id: 7, avatarRev: 1_700_000_000 }), "/api/avatar/7?v=1700000000");
  assert.equal(avatarSrc({ id: 7 }), null);
  assert.equal(avatarSrc({ id: 7, avatarRev: 0 }), null);
});
