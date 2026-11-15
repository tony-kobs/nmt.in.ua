import assert from "node:assert/strict";
import test from "node:test";
import { parentAfterLoginPath, parentMayOpen, parentMustLeave } from "./parentCabinet";

test("a parent may open only the cabinet, account and textbook", () => {
  for (const path of ["/parent", "/parent/accept", "/account", "/materials/textbook", "/materials"]) {
    assert.equal(parentMayOpen(path), true, path);
    assert.equal(parentMustLeave(path), false, path);
  }
  for (const path of ["/", "/topic", "/simulator", "/sessions", "/results", "/consultations",
    "/leaderboard", "/problems", "/practice/fractions", "/marathon", "/join/CODE", "/session/4",
    "/diagnostic", "/assign", "/students/3"]) {
    assert.equal(parentMayOpen(path), false, path);
    assert.equal(parentMustLeave(path), true, path);
  }
  assert.equal(parentMustLeave("/login"), false);
  assert.equal(parentMustLeave("/register/parent"), false);
  assert.equal(parentMustLeave("/welcome"), false);
});

test("parent login stays in the cabinet except when accepting an invite", () => {
  assert.equal(parentAfterLoginPath("/topic"), "/parent");
  assert.equal(parentAfterLoginPath("//example.com"), "/parent");
  assert.equal(parentAfterLoginPath("/parent?childId=4"), "/parent?childId=4");
  assert.equal(parentAfterLoginPath("/parent/accept?token=abc"), "/parent/accept?token=abc");
});
