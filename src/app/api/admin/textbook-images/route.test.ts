import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST } from "./route";

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function upload(bytes: Uint8Array, headers: Record<string, string> = {}) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const form = new FormData();
  form.set("file", new File([copy], "figure.png", { type: "image/png" }));
  return new NextRequest("http://nmt.in.ua/api/admin/textbook-images", {
    method: "POST",
    headers: { origin: "http://nmt.in.ua", "sec-fetch-site": "same-origin", ...headers },
    body: form,
  });
}

test("POST /api/admin/textbook-images rejects a cross-site upload before saving", async () => {
  let saved = 0;
  const response = await POST(
    upload(png, { "sec-fetch-site": "cross-site", origin: "https://evil.example" }),
    undefined,
    {
      requireAdmin: async () => {
        saved += 1;
        return { ok: true };
      },
      saveImage: async () => {
        saved += 1;
        return { ok: true, src: "/api/textbook-media/" + "ab".repeat(32) };
      },
    },
  );
  assert.equal(response.status, 403);
  assert.equal(saved, 0);
});

test("POST /api/admin/textbook-images is admin-only", async () => {
  const response = await POST(upload(png), undefined, {
    requireAdmin: async () => ({ ok: false, status: 401 }),
    saveImage: async () => {
      throw new Error("should not save");
    },
  });
  assert.equal(response.status, 401);
});

test("POST /api/admin/textbook-images rejects an svg and stores a png", async () => {
  const svg = new TextEncoder().encode("<svg></svg>");
  const rejected = await POST(upload(svg), undefined, {
    requireAdmin: async () => ({ ok: true }),
    saveImage: async (bytes) => {
      const { checkTextbookImage } = await import("@/modules/textbook/imageLimits");
      const checked = checkTextbookImage(bytes);
      if (!checked.ok) return checked;
      return { ok: true, src: "/api/textbook-media/" + "ab".repeat(32) };
    },
  });
  assert.equal(rejected.status, 415);
  assert.deepEqual(await rejected.json(), { ok: false, error: "type" });

  const stored = await POST(upload(png), undefined, {
    requireAdmin: async () => ({ ok: true }),
    saveImage: async () => ({ ok: true, src: "/api/textbook-media/" + "ab".repeat(32) }),
  });
  assert.equal(stored.status, 200);
  assert.deepEqual(await stored.json(), {
    ok: true,
    src: "/api/textbook-media/" + "ab".repeat(32),
  });
});
