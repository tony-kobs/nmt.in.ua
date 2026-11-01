import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "./[hash]/route";

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9, 9]);

test("GET /api/textbook-media returns the sniffed bytes and 404 for an unknown hash", async () => {
  const hash = "ab".repeat(32);
  const ok = await GET(
    new Request("http://nmt.in.ua/api/textbook-media/" + hash),
    { params: Promise.resolve({ hash }) },
    { load: async () => ({ mime: "image/png", bytes: png }) },
  );
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "image/png");
  assert.equal(ok.headers.get("x-content-type-options"), "nosniff");
  const body = new Uint8Array(await ok.arrayBuffer());
  assert.deepEqual(body, png);

  const missing = await GET(
    new Request("http://nmt.in.ua/api/textbook-media/nope"),
    { params: Promise.resolve({ hash: "nope" }) },
    { load: async () => null },
  );
  assert.equal(missing.status, 404);
});
