import assert from "node:assert/strict";
import test from "node:test";
import { canShowParentInvites, INITIAL_PARENT_INVITE, parentInviteReducer } from "./parentInviteState";

const result = { status: "success" as const, url: "https://example.invalid/invite", expiresAt: "2026-11-22T12:00:00.000Z" };

test("invitation UI is limited to actual student and teacher roles", () => {
  for (const role of ["student", "teacher"] as const) assert.equal(canShowParentInvites({ role, realRole: role }), true);
  for (const role of ["parent", "admin", "dev"] as const) assert.equal(canShowParentInvites({ role }), false);
  assert.equal(canShowParentInvites({ role: "student", realRole: "admin" }), false);
  assert.equal(canShowParentInvites({ role: "teacher", realRole: "dev" }), false);
});

test("selection and new requests remove previously displayed links and copy state", () => {
  const state = { ...INITIAL_PARENT_INVITE, studentId: "17", result, copy: "copied" as const };
  assert.deepEqual(parentInviteReducer(state, { type: "select", studentId: "18" }), { ...INITIAL_PARENT_INVITE, studentId: "18" });
  assert.deepEqual(parentInviteReducer(state, { type: "start" }), { ...state, pending: true, result: null, copy: "idle" });
});

test("late responses for a different student cannot display a link", () => {
  const state = { ...INITIAL_PARENT_INVITE, studentId: "18" };
  assert.equal(parentInviteReducer(state, { type: "result", studentId: "17", result }), state);
});

test("success, copy failures and safe action errors produce the expected UI state", () => {
  let state = parentInviteReducer({ ...INITIAL_PARENT_INVITE, pending: true }, { type: "result", studentId: "", result });
  assert.equal(state.pending, false); assert.equal(state.result, result);
  state = parentInviteReducer(state, { type: "copy", url: result.url, status: "failed" });
  assert.equal(state.copy, "failed");
  state = parentInviteReducer(state, { type: "copy", url: result.url, status: "copied" });
  assert.equal(state.copy, "copied");
  assert.equal(parentInviteReducer(state, { type: "copy", url: "old", status: "failed" }), state);
  for (const code of ["unauthorized", "forbidden", "rate_limited", "generic"] as const) {
    const failed = parentInviteReducer(state, { type: "result", studentId: "", result: { status: "error", code } });
    assert.deepEqual(failed.result, { status: "error", code });
    assert.equal(failed.copy, "idle");
  }
});
