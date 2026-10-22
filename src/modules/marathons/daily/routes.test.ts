import assert from "node:assert/strict";
import test from "node:test";
import { isMarathonManagePath, isPublicMarathonPath } from "./routes";

test("only the landing and join form are public", () => {
  assert.equal(isPublicMarathonPath("/marathon/math-5"), true);
  assert.equal(isPublicMarathonPath("/marathon/math-5/join"), true);
  assert.equal(isPublicMarathonPath("/marathon/math-5/map"), false);
  assert.equal(isPublicMarathonPath("/marathon/math-5/day/1"), false);
  assert.equal(isPublicMarathonPath("/marathon/math-5/final"), false);
  assert.equal(isPublicMarathonPath("/marathon"), false);
  assert.equal(isPublicMarathonPath("/admin/marathons"), false);
});

test("admin marathon routes are the manage surface", () => {
  assert.equal(isMarathonManagePath("/admin/marathons"), true);
  assert.equal(isMarathonManagePath("/admin/marathons/4"), true);
  assert.equal(isMarathonManagePath("/admin/support"), true);
  assert.equal(isMarathonManagePath("/marathon/math-5"), false);
});
