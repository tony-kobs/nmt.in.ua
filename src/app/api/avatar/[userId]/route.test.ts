import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { GET } from "./route";

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);

function requestFor(userId: string, version?: string): NextRequest {
  const url = new URL(`http://localhost/api/avatar/${userId}`);
  if (version) url.searchParams.set("v", version);
  return new NextRequest(url, { method: "GET" });
}

test("GET /api/avatar returns 404 for a non-numeric id", async () => {
  const response = await GET(requestFor("abc"), {
    params: Promise.resolve({ userId: "abc" }),
  }, {
    getStoredAvatar: async () => {
      throw new Error("should not load");
    },
  });
  assert.equal(response.status, 404);
});

test("GET /api/avatar returns 404 when no row exists", async () => {
  const response = await GET(requestFor("42"), {
    params: Promise.resolve({ userId: "42" }),
  }, {
    getStoredAvatar: async () => null,
  });
  assert.equal(response.status, 404);
});

test("GET /api/avatar returns the image with an immutable cache when versioned", async () => {
  const response = await GET(requestFor("42", "1700000000"), {
    params: Promise.resolve({ userId: "42" }),
  }, {
    getStoredAvatar: async (userId) => {
      assert.equal(userId, 42);
      return {
        mime: "image/jpeg",
        bytes: JPEG,
        updatedAtSec: 1_700_000_000,
      };
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/jpeg");
  assert.equal(
    response.headers.get("cache-control"),
    "public, max-age=31536000, immutable",
  );
  const body = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual([...body], [...JPEG]);
});
