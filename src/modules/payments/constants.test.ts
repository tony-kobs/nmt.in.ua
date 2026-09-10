import assert from "node:assert/strict";
import test from "node:test";

import {
  MONO_CCY_UAH,
  TEACHER_FEE_KOPIYKY,
  TEACHER_FEE_UAH,
  isTeacherPaymentReference,
} from "./constants";

test("teacher fee is 500 UAH = 50000 kopiyky and UAH ccy 980", () => {
  assert.equal(TEACHER_FEE_UAH, 500);
  assert.equal(TEACHER_FEE_KOPIYKY, 50_000);
  assert.equal(TEACHER_FEE_KOPIYKY, TEACHER_FEE_UAH * 100);
  assert.equal(MONO_CCY_UAH, 980);
});

test("isTeacherPaymentReference accepts 32 hex chars", () => {
  assert.equal(isTeacherPaymentReference("a".repeat(32)), true);
  assert.equal(isTeacherPaymentReference("A1b2c3d4e5f60718293a4b5c6d7e8f90"), true);
  assert.equal(isTeacherPaymentReference("short"), false);
  assert.equal(isTeacherPaymentReference(""), false);
});
