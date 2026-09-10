import assert from "node:assert/strict";
import test from "node:test";

import {
  firstValidTeacherPaymentReference,
  pickTeacherRegisterBypassReference,
  resolveBypassReference,
} from "./bypassReference";

const older = "a".repeat(32);
const newer = "b".repeat(32);

test("firstValidTeacherPaymentReference skips invalid and empty values", () => {
  assert.equal(firstValidTeacherPaymentReference(null, "", "nope", newer), newer);
  assert.equal(firstValidTeacherPaymentReference(undefined, "  "), null);
});

test("resolveBypassReference prefers the form/checkout reference when both are valid", () => {
  assert.equal(resolveBypassReference(older, newer), newer);
});

test("resolveBypassReference does not fail when cookie and form differ", () => {
  assert.notEqual(resolveBypassReference(older, newer), null);
  assert.equal(resolveBypassReference(older, newer), newer);
});

test("resolveBypassReference uses the cookie when the form reference is missing", () => {
  assert.equal(resolveBypassReference(older, ""), older);
  assert.equal(resolveBypassReference(older, "not-a-reference"), older);
  assert.equal(resolveBypassReference(older, null), older);
});

test("resolveBypassReference uses the form when the cookie is missing", () => {
  assert.equal(resolveBypassReference(null, newer), newer);
  assert.equal(resolveBypassReference("stale", newer), newer);
});

test("resolveBypassReference returns null when neither reference is valid", () => {
  assert.equal(resolveBypassReference(null, ""), null);
  assert.equal(resolveBypassReference("cookie", "form"), null);
});

test("pickTeacherRegisterBypassReference prefers checkout over error over cookie", () => {
  assert.equal(
    pickTeacherRegisterBypassReference({
      checkoutReference: newer,
      errorReference: older,
      pendingCookieReference: "c".repeat(32),
    }),
    newer,
  );
  assert.equal(
    pickTeacherRegisterBypassReference({
      checkoutReference: null,
      errorReference: newer,
      pendingCookieReference: older,
    }),
    newer,
  );
  assert.equal(
    pickTeacherRegisterBypassReference({
      pendingCookieReference: older,
    }),
    older,
  );
});
