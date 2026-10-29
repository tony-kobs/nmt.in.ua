import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTOSAVE_DELAY_MS,
  autosaveReady,
  isBlankTextbookDraft,
  parseDraftBackup,
  readTextbookDraftBackup,
  shouldWarnBeforeUnload,
  textbookDraftBackupKey,
  writeTextbookDraftBackup,
} from "./draftBackup";
import { TEXTBOOK_BODY_MAX } from "./draftTypes";

test("autosave waits a few seconds and only after the text changed", () => {
  assert.equal(AUTOSAVE_DELAY_MS >= 2000 && AUTOSAVE_DELAY_MS <= 5000, true);
  assert.equal(
    autosaveReady({ body: "а", savedBody: "а", uploading: false, saving: false, held: false }),
    false,
  );
  assert.equal(
    autosaveReady({ body: "б", savedBody: "а", uploading: false, saving: false, held: false }),
    true,
  );
  assert.equal(
    autosaveReady({ body: "б", savedBody: "а", uploading: true, saving: false, held: false }),
    false,
  );
  assert.equal(
    autosaveReady({ body: "б", savedBody: "а", uploading: false, saving: true, held: false }),
    false,
  );
  assert.equal(
    autosaveReady({ body: "б", savedBody: "а", uploading: false, saving: false, held: true }),
    false,
  );
  assert.equal(shouldWarnBeforeUnload("б", "а"), true);
  assert.equal(shouldWarnBeforeUnload("а", "а"), false);
  assert.equal(isBlankTextbookDraft("  \n"), true);
  assert.equal(isBlankTextbookDraft("# Теорія"), false);
});

test("a local draft backup roundtrips and rejects a broken payload", () => {
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
  };
  const backup = { body: "# Теорія", revision: 4, savedAt: "2026-10-29T18:41:00.000Z" };
  writeTextbookDraftBackup(storage, "ALG-08-FRACTIONS", backup);
  assert.equal(textbookDraftBackupKey("ALG-08-FRACTIONS") !== textbookDraftBackupKey("GEO-07-ELEM-PLAN"), true);
  assert.deepEqual(readTextbookDraftBackup(storage, "ALG-08-FRACTIONS"), backup);
  assert.equal(readTextbookDraftBackup(storage, "GEO-07-ELEM-PLAN"), null);
  assert.equal(parseDraftBackup("не json"), null);
  assert.equal(parseDraftBackup(JSON.stringify({ body: 1, revision: 1, savedAt: "x" })), null);
  assert.equal(parseDraftBackup(JSON.stringify({ body: "а", revision: 1.5, savedAt: "x" })), null);
  assert.equal(
    parseDraftBackup(JSON.stringify({ body: "а".repeat(TEXTBOOK_BODY_MAX + 1), revision: 1, savedAt: "x" })),
    null,
  );
});
