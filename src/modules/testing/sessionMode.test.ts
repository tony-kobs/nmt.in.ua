import assert from "node:assert/strict";
import test from "node:test";
import { isPracticeMode, resolveSessionMode } from "./sessionMode";

test("resolveSessionMode maps standard to practice and diagnostic to diagnostic", () => {
  assert.equal(resolveSessionMode("standard"), "practice");
  assert.equal(resolveSessionMode("diagnostic"), "diagnostic");
});

test("resolveSessionMode buckets Ultimate and NMT as exam, never practice or diagnostic", () => {
  assert.equal(resolveSessionMode("ultimate"), "exam");
  assert.equal(resolveSessionMode("nmt"), "exam");
});

test("isPracticeMode is true only for standard", () => {
  assert.equal(isPracticeMode("standard"), true);
  assert.equal(isPracticeMode("diagnostic"), false);
  assert.equal(isPracticeMode("ultimate"), false);
  assert.equal(isPracticeMode("nmt"), false);
});
