import assert from "node:assert/strict";
import test from "node:test";

import { decideViewRole, effectiveRole } from "./viewRole";

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
