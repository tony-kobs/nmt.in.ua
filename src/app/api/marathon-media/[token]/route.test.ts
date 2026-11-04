import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "./route";

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9, 9]);
const token = "ab".repeat(16);

test("GET /api/marathon-media returns the intro bytes and 404 when the token is unknown", async () => {
  const ok = await GET(
    new Request(`http://nmt.in.ua/api/marathon-media/${token}`),
    { params: Promise.resolve({ token }) },
    { load: async () => ({ mime: "image/png", bytes: png }) },
  );
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "image/png");
  assert.equal(ok.headers.get("x-content-type-options"), "nosniff");
  assert.match(ok.headers.get("cache-control") ?? "", /public/);
  const body = new Uint8Array(await ok.arrayBuffer());
  assert.deepEqual(body, png);

  const missing = await GET(
    new Request("http://nmt.in.ua/api/marathon-media/nope"),
    { params: Promise.resolve({ token: "nope" }) },
    { load: async () => null },
  );
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("cache-control"), "no-store");
});
