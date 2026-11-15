import assert from "node:assert/strict";
import test from "node:test";

import { decideViewRole, effectiveRole, viewHomePath } from "./viewRole";

test("each role has its cabinet home and parent is not a staff view", () => {
  assert.equal(viewHomePath("parent"), "/parent");
  assert.equal(viewHomePath("teacher"), "/assign");
  for (const role of ["student", "admin", "dev"] as const) {
    assert.equal(viewHomePath(role), "/");
  }
  assert.equal(effectiveRole("parent", "admin"), "parent");
  assert.equal(effectiveRole("parent", "teacher"), "parent");
  assert.deepEqual(decideViewRole("parent", "teacher"), { ok: false });
  assert.deepEqual(decideViewRole("admin", "parent"), { ok: false });
});

test("effective role follows the database unless staff is viewing student or teacher", () => {
  assert.equal(effectiveRole("teacher", "student"), "teacher");
  assert.equal(effectiveRole("student", "admin"), "student");
  assert.equal(effectiveRole("student", "teacher"), "student");
  assert.equal(effectiveRole("admin", undefined), "admin");
  assert.equal(effectiveRole("admin", "student"), "student");
  assert.equal(effectiveRole("admin", "teacher"), "teacher");
  assert.equal(effectiveRole("dev", "teacher"), "teacher");
  assert.equal(effectiveRole("dev", "admin"), "dev");
  assert.equal(effectiveRole("admin", "dev"), "admin");
  assert.equal(effectiveRole("dev", "self"), "dev");
});

test("only a stored admin or dev can choose student, teacher, or their own role", () => {
  assert.deepEqual(decideViewRole("student", "teacher"), { ok: false });
  assert.deepEqual(decideViewRole("teacher", "admin"), { ok: false });
  assert.deepEqual(decideViewRole("teacher", "self"), { ok: false });
  assert.deepEqual(decideViewRole("admin", "admin"), { ok: false });
  assert.deepEqual(decideViewRole("admin", "dev"), { ok: false });
  assert.deepEqual(decideViewRole("dev", "admin"), { ok: false });
  assert.deepEqual(decideViewRole("dev", "dev"), { ok: false });
  assert.deepEqual(decideViewRole("admin", "student"), {
    ok: true,
    role: "student",
    viewAs: "student",
  });
  assert.deepEqual(decideViewRole("dev", " teacher "), {
    ok: true,
    role: "teacher",
    viewAs: "teacher",
  });
  assert.deepEqual(decideViewRole("dev", "self"), {
    ok: true,
    role: "dev",
    viewAs: null,
  });
  assert.deepEqual(decideViewRole("admin", "self"), {
    ok: true,
    role: "admin",
    viewAs: null,
  });
});
