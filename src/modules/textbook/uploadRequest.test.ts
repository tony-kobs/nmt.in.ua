import assert from "node:assert/strict";
import test from "node:test";
import { textbookUploadAllowed } from "./uploadRequest";

test("textbook upload accepts a same-origin browser and a matching host", () => {
  assert.equal(
    textbookUploadAllowed({
      host: "nmt.in.ua",
      origin: "https://evil.example",
      secFetchSite: "cross-site",
    }),
    false,
  );
  assert.equal(
    textbookUploadAllowed({
      host: "127.1.10.37:3000",
      origin: "https://nmt.in.ua",
      secFetchSite: "same-origin",
    }),
    true,
  );
  assert.equal(
    textbookUploadAllowed({
      host: "nmt.in.ua",
      origin: "https://nmt.in.ua",
      secFetchSite: null,
    }),
    true,
  );
  assert.equal(
    textbookUploadAllowed({ host: "nmt.in.ua", origin: null, secFetchSite: null }),
    false,
  );
});
