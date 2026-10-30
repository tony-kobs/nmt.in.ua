import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { resetSchemaGuardForTests } from "@/lib/db/schemaGuard";
import { TEXTBOOK_BODY_MAX } from "./draftTypes";
import {
  listTextbookVersions,
  loadTextbookVersionBody,
  readTextbookDraftRow,
  restoreTextbookVersion,
  saveTextbookDraft,
} from "./store";

type Section = {
  body: string;
  published: string | null;
  revision: number;
  updatedBy: number | null;
};

type VersionRow = {
  id: number;
  theme: string;
  body: string;
  authorId: number | null;
  createdAt: number;
};

function createDb(options?: { themes?: string[] }) {
  const themes = new Set(options?.themes ?? ["ALG-08-FRACTIONS", "GEO-07-ELEM-PLAN"]);
  const authors = new Map<number, string>([[7, "Антон"]]);
  let sections = new Map<string, Section>();
  let versions: VersionRow[] = [];
  let nextId = 1;
  let clock = 1_767_000_000;
  let failVersion = false;
  let snapshot: { sections: Map<string, Section>; versions: VersionRow[]; nextId: number } | null = null;

  const clone = () => ({
    sections: new Map([...sections].map(([key, value]) => [key, { ...value }])),
    versions: versions.map((row) => ({ ...row })),
    nextId,
  });

  const connection: SqlConnection = {
    beginTransaction: async () => {
      snapshot = clone();
    },
    commit: async () => {
      snapshot = null;
    },
    rollback: async () => {
      if (!snapshot) return;
      sections = snapshot.sections;
      versions = snapshot.versions;
      nextId = snapshot.nextId;
      snapshot = null;
    },
    release: () => {},
    query: async <T>(sql: string, params: unknown[] = []) => {
      const text = sql.replace(/\s+/g, " ").trim();
      if (text.includes("schema_migrations")) {
        return [
          { version: "059_textbook_sections.sql" },
          { version: "061_textbook_section_versions.sql" },
        ] as T[];
      }
      if (text.startsWith("SELECT code FROM themes")) {
        const code = String(params[0]);
        return (themes.has(code) ? [{ code }] : []) as T[];
      }
      if (text.startsWith("SELECT body") && text.includes("textbook_section_versions")) {
        const id = Number(params[0]);
        const code = String(params[1]);
        const row = versions.find((item) => item.id === id && item.theme === code);
        return (row ? [{ body: row.body }] : []) as T[];
      }
      if (text.startsWith("SELECT v.id")) {
        const code = String(params[0]);
        return versions
          .filter((row) => row.theme === code)
          .sort((a, b) => b.id - a.id)
          .map((row) => ({
            id: row.id,
            author_name: row.authorId == null ? null : (authors.get(row.authorId) ?? null),
            created_at_sec: row.createdAt,
          })) as T[];
      }
      if (text.startsWith("SELECT body, published_body")) {
        const row = sections.get(String(params[0]));
        if (!row) return [] as T[];
        return [
          {
            body: row.body,
            published_body: row.published,
            draft_revision: row.revision,
            updated_at_sec: clock,
          },
        ] as T[];
      }
      return [] as T[];
    },
    execute: async (sql: string, params: unknown[] = []) => {
      const text = sql.replace(/\s+/g, " ").trim();
      if (text.startsWith("INSERT INTO textbook_sections")) {
        const code = String(params[0]);
        if (sections.has(code)) {
          throw Object.assign(new Error("duplicate"), { errno: 1062 });
        }
        sections.set(code, {
          body: String(params[1]),
          published: null,
          revision: 1,
          updatedBy: Number(params[2]),
        });
        clock += 1;
        return { insertId: 0, affectedRows: 1 };
      }
      if (text.includes("draft_revision = draft_revision + 1")) {
        const row = sections.get(String(params[2]));
        const expected = Number(params[3]);
        if (!row || row.revision !== expected) return { insertId: 0, affectedRows: 0 };
        row.body = String(params[0]);
        row.updatedBy = Number(params[1]);
        row.revision += 1;
        clock += 1;
        return { insertId: 0, affectedRows: 1 };
      }
      if (text.includes("published_body = body")) {
        const row = sections.get(String(params[1]));
        if (!row) return { insertId: 0, affectedRows: 0 };
        row.published = row.body;
        row.updatedBy = Number(params[0]);
        clock += 1;
        return { insertId: 0, affectedRows: 1 };
      }
      if (text.startsWith("INSERT INTO textbook_section_versions")) {
        if (failVersion) {
          failVersion = false;
          throw new Error("version insert failed");
        }
        const id = nextId;
        nextId += 1;
        clock += 1;
        versions.push({
          id,
          theme: String(params[0]),
          body: String(params[1]),
          authorId: Number(params[2]),
          createdAt: clock,
        });
        return { insertId: id, affectedRows: 1 };
      }
      return { insertId: 0, affectedRows: 0 };
    },
  };

  return {
    connection,
    get sections() {
      return sections;
    },
    get versions() {
      return versions;
    },
    failNextVersion() {
      failVersion = true;
    },
  };
}

function harness(options?: { themes?: string[] }) {
  resetSchemaGuardForTests("textbook");
  const db = createDb(options);
  const getConnection = async () => db.connection;
  return { db, getConnection };
}

test("a draft autosave bumps the revision and does not publish a version", async () => {
  const { db, getConnection } = harness();
  const first = await saveTextbookDraft({
    themeCode: "ALG-08-FRACTIONS",
    body: "# Чернетка",
    expectedRevision: 0,
    userId: 7,
    publish: false,
    getConnection,
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.revision, 1);
  assert.equal(Number.isNaN(Date.parse(first.savedAt)), false);
  assert.equal(db.versions.length, 0);
  assert.equal(db.sections.get("ALG-08-FRACTIONS")?.published, null);

  const second = await saveTextbookDraft({
    themeCode: "ALG-08-FRACTIONS",
    body: "# Чернетка 2",
    expectedRevision: first.revision,
    userId: 7,
    publish: false,
    getConnection,
  });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.revision, 2);
  const row = await readTextbookDraftRow("ALG-08-FRACTIONS", getConnection);
  assert.equal(row.body, "# Чернетка 2");
  assert.equal(row.revision, 2);
  assert.equal(db.versions.length, 0);
});

test("a stale revision does not overwrite the newer draft", async () => {
  const { db, getConnection } = harness();
  const saved = await saveTextbookDraft({
    themeCode: "ALG-08-FRACTIONS",
    body: "перша вкладка",
    expectedRevision: 0,
    userId: 7,
    publish: false,
    getConnection,
  });
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  await saveTextbookDraft({
    themeCode: "ALG-08-FRACTIONS",
    body: "друга вкладка",
    expectedRevision: saved.revision,
    userId: 7,
    publish: false,
    getConnection,
  });
  const stale = await saveTextbookDraft({
    themeCode: "ALG-08-FRACTIONS",
    body: "застарілий текст",
    expectedRevision: saved.revision,
    userId: 7,
    publish: false,
    getConnection,
  });
  assert.deepEqual(stale, { ok: false, reason: "conflict" });
  assert.equal(db.sections.get("ALG-08-FRACTIONS")?.body, "друга вкладка");
  assert.equal(db.sections.get("ALG-08-FRACTIONS")?.revision, 2);

  const duplicate = await saveTextbookDraft({
    themeCode: "ALG-08-FRACTIONS",
    body: "ще одна нова",
    expectedRevision: 0,
    userId: 7,
    publish: false,
    getConnection,
  });
  assert.deepEqual(duplicate, { ok: false, reason: "conflict" });
  assert.equal(db.sections.get("ALG-08-FRACTIONS")?.body, "друга вкладка");
});

test("publish stores a version and restore puts it back into the draft only", async () => {
  const { db, getConnection } = harness();
  const published = await saveTextbookDraft({
    themeCode: "ALG-08-FRACTIONS",
    body: "# Версія А",
    expectedRevision: 0,
    userId: 7,
    publish: true,
    getConnection,
  });
  assert.equal(published.ok, true);
  if (!published.ok) return;
  const edited = await saveTextbookDraft({
    themeCode: "ALG-08-FRACTIONS",
    body: "# Чернетка після публікації",
    expectedRevision: published.revision,
    userId: 7,
    publish: false,
    getConnection,
  });
  assert.equal(edited.ok, true);
  if (!edited.ok) return;
  const again = await saveTextbookDraft({
    themeCode: "ALG-08-FRACTIONS",
    body: "# Версія Б",
    expectedRevision: edited.revision,
    userId: 7,
    publish: true,
    getConnection,
  });
  assert.equal(again.ok, true);
  if (!again.ok) return;

  const history = await listTextbookVersions("ALG-08-FRACTIONS", getConnection);
  assert.deepEqual(
    history.map((item) => item.authorName),
    ["Антон", "Антон"],
  );
  assert.equal(history[0] && history[1] && history[0].id > history[1].id, true);
  const newest = history[0];
  const older = history[1];
  assert.ok(newest && older);
  assert.equal(await loadTextbookVersionBody("ALG-08-FRACTIONS", newest.id, getConnection), "# Версія Б");
  assert.equal(await loadTextbookVersionBody("ALG-08-FRACTIONS", older.id, getConnection), "# Версія А");

  const restored = await restoreTextbookVersion({
    themeCode: "ALG-08-FRACTIONS",
    versionId: older.id,
    expectedRevision: again.revision,
    userId: 7,
    getConnection,
  });
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(restored.body, "# Версія А");
  assert.equal(restored.revision, again.revision + 1);
  assert.equal(db.sections.get("ALG-08-FRACTIONS")?.body, "# Версія А");
  assert.equal(db.sections.get("ALG-08-FRACTIONS")?.published, "# Версія Б");
  assert.equal(db.versions.length, 2);

  const missing = await restoreTextbookVersion({
    themeCode: "ALG-08-FRACTIONS",
    versionId: 99,
    expectedRevision: restored.revision,
    userId: 7,
    getConnection,
  });
  assert.deepEqual(missing, { ok: false, reason: "version" });
  assert.equal(db.sections.get("ALG-08-FRACTIONS")?.body, "# Версія А");
});

test("a failed version insert rolls the publish back", async () => {
  const { db, getConnection } = harness();
  db.failNextVersion();
  await assert.rejects(() =>
    saveTextbookDraft({
      themeCode: "ALG-08-FRACTIONS",
      body: "# Не записалось",
      expectedRevision: 0,
      userId: 7,
      publish: true,
      getConnection,
    }),
  );
  assert.equal(db.sections.size, 0);
  assert.equal(db.versions.length, 0);
});

test("an unknown theme and an oversized body are refused before a write", async () => {
  const { db, getConnection } = harness({ themes: ["ALG-08-FRACTIONS"] });
  const missing = await saveTextbookDraft({
    themeCode: "NO-SUCH-THEME",
    body: "текст",
    expectedRevision: 0,
    userId: 7,
    publish: true,
    getConnection,
  });
  assert.deepEqual(missing, { ok: false, reason: "theme" });
  const huge = await saveTextbookDraft({
    themeCode: "ALG-08-FRACTIONS",
    body: "а".repeat(TEXTBOOK_BODY_MAX + 1),
    expectedRevision: 0,
    userId: 7,
    publish: false,
    getConnection,
  });
  assert.deepEqual(huge, { ok: false, reason: "size" });
  assert.equal(db.sections.size, 0);
  assert.equal(db.versions.length, 0);
});

test("migration 061 adds draft_revision and the version table", () => {
  const sql = readFileSync("scripts/sql/061_textbook_section_versions.sql", "utf8");
  assert.match(sql, /draft_revision/);
  assert.match(sql, /textbook_section_versions/);
  assert.match(sql, /backup/i);
});
