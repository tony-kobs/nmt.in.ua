import assert from "node:assert/strict";
import test from "node:test";

import {
  CCY_UAH,
  TEACHER_FEE_KOPIYKY,
  TEACHER_FEE_UAH,
  WAYFORPAY_CURRENCY,
  formatWayForPayAmount,
  isAllowedWayForPayCheckoutUrl,
  isSafeCheckoutUrl,
  isTeacherPaymentReference,
  parseWayForPayAmountToKopiyky,
} from "./constants";

test("teacher fee is 500 UAH = 50000 kopiyky; WayForPay amount is major units", () => {
  assert.equal(TEACHER_FEE_UAH, 500);
  assert.equal(TEACHER_FEE_KOPIYKY, 50_000);
  assert.equal(TEACHER_FEE_KOPIYKY, TEACHER_FEE_UAH * 100);
  assert.equal(CCY_UAH, 980);
  assert.equal(WAYFORPAY_CURRENCY, "UAH");
  assert.equal(formatWayForPayAmount(TEACHER_FEE_KOPIYKY), "500.00");
  assert.equal(parseWayForPayAmountToKopiyky(500), 50_000);
  assert.equal(parseWayForPayAmountToKopiyky("500.00"), 50_000);
  assert.equal(parseWayForPayAmountToKopiyky(1547.36), 154_736);
});

test("isTeacherPaymentReference accepts 32 hex chars", () => {
  assert.equal(isTeacherPaymentReference("a".repeat(32)), true);
  assert.equal(isTeacherPaymentReference("A1b2c3d4e5f60718293a4b5c6d7e8f90"), true);
  assert.equal(isTeacherPaymentReference("short"), false);
  assert.equal(isTeacherPaymentReference(""), false);
});

test("isSafeCheckoutUrl allows only https; WayForPay host is required for checkout", () => {
  assert.equal(isSafeCheckoutUrl("https://secure.wayforpay.com/pay"), true);
  assert.equal(isSafeCheckoutUrl("http://secure.wayforpay.com/pay"), false);
  assert.equal(isSafeCheckoutUrl("javascript:alert(1)"), false);
  assert.equal(
    isAllowedWayForPayCheckoutUrl("https://secure.wayforpay.com/pay"),
    true,
  );
  assert.equal(
    isAllowedWayForPayCheckoutUrl("https://pay.mbnk.biz/inv"),
    false,
  );
  assert.equal(
    isAllowedWayForPayCheckoutUrl("https://evil.example/pay"),
    false,
  );
});
