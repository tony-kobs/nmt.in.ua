import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import type { SqlConnection } from "@/lib/db/mysql";
import { resetSchemaGuardForTests } from "@/lib/db/schemaGuard";
import { getTextbookImage, hashTextbookImage, saveTextbookImage } from "./imageStore";

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

function connection(state: {
  rows: Map<string, { mime: string; bytes: Uint8Array }>;
  inserts: number;
  duplicate: boolean;
}): SqlConnection {
  return {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async <T>(sql: string, params: unknown[] = []) => {
      const text = sql.replace(/\s+/g, " ").trim();
      if (text.includes("schema_migrations")) {
        return [{ version: "060_textbook_images.sql" }] as T[];
      }
      const hash = String(params[0] ?? "");
      if (text.startsWith("SELECT content_hash")) {
        return (state.rows.has(hash) ? [{ content_hash: hash }] : []) as T[];
      }
      if (text.startsWith("SELECT mime")) {
        const row = state.rows.get(hash);
        return (row ? [{ mime: row.mime, bytes: Buffer.from(row.bytes) }] : []) as T[];
      }
      return [] as T[];
    },
    execute: async (sql: string, params: unknown[] = []) => {
      if (state.duplicate) {
        throw Object.assign(new Error("duplicate"), { errno: 1062 });
      }
      state.inserts += 1;
      const hash = String(params[0]);
      const bytes = params[2];
      state.rows.set(hash, {
        mime: String(params[1]),
        bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(),
      });
      return { insertId: 0, affectedRows: 1 };
    },
  };
}

test("the same textbook image is stored once and served back by its hash", async () => {
  resetSchemaGuardForTests("textbook-images");
  const state = {
    rows: new Map<string, { mime: string; bytes: Uint8Array }>(),
    inserts: 0,
    duplicate: false,
  };
  const getConnection = async () => connection(state);
  const hash = hashTextbookImage(png);
  assert.equal(hash, createHash("sha256").update(png).digest("hex"));

  const first = await saveTextbookImage(png, getConnection);
  const second = await saveTextbookImage(png, getConnection);
  assert.deepEqual(first, { ok: true, src: `/api/textbook-media/${hash}` });
  assert.deepEqual(second, first);
  assert.equal(state.inserts, 1);

  const loaded = await getTextbookImage(hash, getConnection);
  assert.equal(loaded?.mime, "image/png");
  assert.deepEqual([...(loaded?.bytes ?? [])], [...png]);
  assert.equal(await getTextbookImage("nope", getConnection), null);

  const svg = await saveTextbookImage(Uint8Array.from([0x3c, 0x73, 0x76, 0x67]), getConnection);
  assert.deepEqual(svg, { ok: false, code: "type" });
});

test("a duplicate-key race still returns the existing textbook image path", async () => {
  resetSchemaGuardForTests("textbook-images");
  const state = {
    rows: new Map<string, { mime: string; bytes: Uint8Array }>(),
    inserts: 0,
    duplicate: true,
  };
  const saved = await saveTextbookImage(png, async () => connection(state));
  assert.equal(saved.ok, true);
  if (saved.ok) assert.match(saved.src, /^\/api\/textbook-media\/[a-f0-9]{64}$/);
  assert.equal(state.inserts, 0);
});
