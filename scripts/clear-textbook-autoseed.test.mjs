import assert from "node:assert/strict";
import test from "node:test";
import { textbookAutoseedAction } from "./clear-textbook-autoseed.mjs";

const snapshots = { "ALG-07-EQ": "seeded text" };

test("an untouched auto-seed row is deleted", () => {
  assert.equal(
    textbookAutoseedAction(
      { themeCode: "ALG-07-EQ", body: "seeded text", publishedBody: "seeded text" },
      snapshots,
    ),
    "delete",
  );
});

test("a later draft is kept and the seeded publication is cleared", () => {
  assert.equal(
    textbookAutoseedAction(
      { themeCode: "ALG-07-EQ", body: "admin draft", publishedBody: "seeded text" },
      snapshots,
    ),
    "clear-published",
  );
});

test("an explicit publish that is not the snapshot is kept", () => {
  assert.equal(
    textbookAutoseedAction(
      { themeCode: "ALG-07-EQ", body: "new", publishedBody: "new" },
      snapshots,
    ),
    "keep",
  );
  assert.equal(
    textbookAutoseedAction(
      { themeCode: "OTHER", body: "seeded text", publishedBody: "seeded text" },
      snapshots,
    ),
    "keep",
  );
});
