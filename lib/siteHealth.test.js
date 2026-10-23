import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { healthBody, readBuildId, siteTmpDir } = require("../lib/siteHealth.cjs");

test("siteTmpDir sits beside www, not in the app directory", () => {
  assert.equal(siteTmpDir("/home/levelhst/nmt.in.ua/www"), "/home/levelhst/nmt.in.ua/tmp");
});

test("healthBody is ok without a build id", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nmt-health-"));
  assert.equal(readBuildId(dir), "");
  assert.equal(healthBody(dir), "ok\n");
});

test("healthBody includes the release BUILD_ID", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nmt-health-"));
  fs.mkdirSync(path.join(dir, ".next"));
  fs.writeFileSync(path.join(dir, ".next", "BUILD_ID"), "abc123\n");
  assert.equal(healthBody(dir), "ok abc123\n");
});
