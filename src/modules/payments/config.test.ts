import assert from "node:assert/strict";
import test from "node:test";

import { readWayForPayConfig, teacherCheckoutUrls } from "./config";
import { WAYFORPAY_DEFAULT_PAY_URL } from "./constants";

test("readWayForPayConfig treats whitespace credentials as missing", () => {
  const config = readWayForPayConfig({
    WAYFORPAY_MERCHANT_ACCOUNT: "   ",
    WAYFORPAY_MERCHANT_SECRET_KEY: "   ",
    WAYFORPAY_MERCHANT_DOMAIN: "nmt.in.ua",
  });
  assert.equal(config.configured, false);
  assert.equal(config.merchantAccount, "");
  assert.equal(config.merchantSecretKey, "");
  assert.equal(config.payUrl, WAYFORPAY_DEFAULT_PAY_URL);
});

test("readWayForPayConfig requires account, secret and domain without hardcoded secrets", () => {
  const config = readWayForPayConfig({
    WAYFORPAY_MERCHANT_ACCOUNT: "from-env-only",
    WAYFORPAY_MERCHANT_SECRET_KEY: "secret-from-env",
    WAYFORPAY_MERCHANT_DOMAIN: "nmt.in.ua",
    WAYFORPAY_PAY_URL: "https://secure.wayforpay.com/pay/",
  });
  assert.equal(config.configured, true);
  assert.equal(config.merchantAccount, "from-env-only");
  assert.equal(config.merchantSecretKey, "secret-from-env");
  assert.equal(config.merchantDomainName, "nmt.in.ua");
  assert.equal(config.payUrl, "https://secure.wayforpay.com/pay");
});

test("readWayForPayConfig derives merchant domain from NEXT_PUBLIC_SITE_URL", () => {
  const config = readWayForPayConfig({
    WAYFORPAY_MERCHANT_ACCOUNT: "acct",
    WAYFORPAY_MERCHANT_SECRET_KEY: "secret",
    NEXT_PUBLIC_SITE_URL: "https://nmt.in.ua/",
  });
  assert.equal(config.configured, true);
  assert.equal(config.merchantDomainName, "nmt.in.ua");
});

test("teacherCheckoutUrls point at WayForPay serviceUrl and teacher return pages", () => {
  const urls = teacherCheckoutUrls("https://nmt.in.ua");
  assert.equal(
    urls.returnUrl("ab".repeat(16)),
    `https://nmt.in.ua/api/payments/wayforpay/return?ref=${"ab".repeat(16)}`,
  );
  assert.equal(urls.failUrl, "https://nmt.in.ua/register/teacher/fail");
  assert.equal(
    urls.serviceUrl,
    "https://nmt.in.ua/api/payments/wayforpay/webhook",
  );
});
