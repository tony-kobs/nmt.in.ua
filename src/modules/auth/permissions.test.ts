import assert from "node:assert/strict";
import test from "node:test";
import { hasPermission, MARATHON_MANAGE } from "./permissions";
import {
  canAssignMentorSessions,
  canImportContent,
  canManageProfiles,
  canManageStudents,
  canReviewConsultationRequests,
  PLATFORM_STAFF_ROLES,
  TEACHING_STAFF_ROLES,
} from "./types";

test("parent has no teaching or platform staff permissions", () => {
  assert.equal(PLATFORM_STAFF_ROLES.includes("parent" as never), false);
  assert.equal(TEACHING_STAFF_ROLES.includes("parent" as never), false);
  for (const check of [
    canAssignMentorSessions, canImportContent, canManageProfiles,
    canManageStudents, canReviewConsultationRequests,
  ]) {
    assert.equal(check("parent"), false);
  }
  assert.equal(hasPermission("parent", MARATHON_MANAGE), false);
});

test("marathon:manage is granted to admin and dev", () => {
  assert.equal(hasPermission("admin", MARATHON_MANAGE), true);
  assert.equal(hasPermission("dev", MARATHON_MANAGE), true);
  assert.equal(hasPermission("teacher", MARATHON_MANAGE), false);
  assert.equal(hasPermission("student", MARATHON_MANAGE), false);
});
