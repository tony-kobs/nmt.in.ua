import assert from "node:assert/strict";
import test from "node:test";
import { canManageStudents } from "@/modules/auth/types";

test("canManageStudents is teacher and platform staff", () => {
  assert.equal(canManageStudents("teacher"), true);
  assert.equal(canManageStudents("admin"), true);
  assert.equal(canManageStudents("dev"), true);
  assert.equal(canManageStudents("student"), false);
});
