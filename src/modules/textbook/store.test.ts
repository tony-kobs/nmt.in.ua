import assert from "node:assert/strict";
import test from "node:test";
import { getTextbookBlocks } from "@/content/learningMaterials/textbook";
import type { SqlConnection } from "@/lib/db/mysql";
import { resetSchemaGuardForTests } from "@/lib/db/schemaGuard";
import { blocksToTextbookMarkup } from "./markup";
import { getPublishedTextbookBlocks, loadTextbookEditorSource } from "./store";

function connection(state: {
  published: string | null;
  body: string | null;
  fail: boolean;
  executed: string[];
}): SqlConnection {
  return {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async <T>(sql: string) => {
      const text = sql.replace(/\s+/g, " ").trim();
      if (text.includes("schema_migrations")) {
        return [{ version: "059_textbook_sections.sql" }] as T[];
      }
      if (state.fail) {
        throw Object.assign(new Error("database down"), { code: "ECONNREFUSED" });
      }
      if (text.startsWith("SELECT body, published_body")) {
        if (state.body === null) return [] as T[];
        return [{ body: state.body, published_body: state.published }] as T[];
      }
      if (text.startsWith("SELECT published_body")) {
        if (state.body === null) return [] as T[];
        return [{ published_body: state.published }] as T[];
      }
      return [] as T[];
    },
    execute: async (sql: string) => {
      state.executed.push(sql);
      return { insertId: 0, affectedRows: 0 };
    },
  };
}

test("reading a textbook section does not publish static markup", async () => {
  resetSchemaGuardForTests("textbook");
  const state = {
    published: null as string | null,
    body: null as string | null,
    fail: false,
    executed: [] as string[],
  };
  const getConnection = async () => connection(state);
  const code = "MATH-05-ELEM-OPS";
  const staticBlocks = getTextbookBlocks(code);

  const missing = await getPublishedTextbookBlocks(code, getConnection);
  assert.deepEqual(missing, staticBlocks);
  const editor = await loadTextbookEditorSource(code, getConnection);
  assert.equal(editor.publishedBody, null);
  assert.equal(editor.body, blocksToTextbookMarkup(staticBlocks));
  assert.equal(state.executed.some((sql) => /INSERT/i.test(sql)), false);

  state.published = "# Лише з бази";
  state.body = "# Лише з бази";
  const published = await getPublishedTextbookBlocks(code, getConnection);
  assert.notDeepEqual(published, staticBlocks);
  assert.match(JSON.stringify(published), /Лише з бази/);

  state.published = "   ";
  const blank = await getPublishedTextbookBlocks(code, getConnection);
  assert.deepEqual(blank, staticBlocks);

  state.fail = true;
  const logged = console.error;
  console.error = () => {};
  const down = await getPublishedTextbookBlocks("ALG-08-FRACTIONS", getConnection);
  console.error = logged;
  assert.deepEqual(down, getTextbookBlocks("ALG-08-FRACTIONS"));
  assert.equal(state.executed.some((sql) => /published_body/i.test(sql) && /INSERT|UPDATE/i.test(sql)), false);
});
