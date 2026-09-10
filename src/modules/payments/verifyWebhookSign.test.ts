import assert from "node:assert/strict";
import test from "node:test";

import {
  verifyIncomingWayForPayWebhook,
  WayForPayWebhookSignError,
} from "./verifyWebhookSign";
import { signCallback } from "./signature";

const payload = {
  merchantAccount: "nmt_account",
  orderReference: "a".repeat(32),
  amount: "500.00",
  currency: "UAH",
  authCode: "541963",
  cardPan: "41****8217",
  transactionStatus: "Approved",
  reasonCode: "1100",
};

test("verifyIncomingWayForPayWebhook accepts HMAC_MD5 merchantSignature", () => {
  const merchantSignature = signCallback("nmt-secret", payload);
  assert.equal(
    verifyIncomingWayForPayWebhook(
      { ...payload, merchantSignature },
      {
        getConfig: () => ({
          merchantAccount: "nmt_account",
          merchantSecretKey: "nmt-secret",
          merchantDomainName: "nmt.in.ua",
          payUrl: "https://secure.wayforpay.com/pay",
          configured: true,
        }),
      },
    ),
    true,
  );
  assert.equal(
    verifyIncomingWayForPayWebhook(
      { ...payload, merchantSignature: "deadbeef" },
      {
        getConfig: () => ({
          merchantAccount: "nmt_account",
          merchantSecretKey: "nmt-secret",
          merchantDomainName: "nmt.in.ua",
          payUrl: "https://secure.wayforpay.com/pay",
          configured: true,
        }),
      },
    ),
    false,
  );
});

test("verifyIncomingWayForPayWebhook throws not_configured without secrets", () => {
  assert.throws(
    () =>
      verifyIncomingWayForPayWebhook(payload, {
        getConfig: () => ({
          merchantAccount: "",
          merchantSecretKey: "",
          merchantDomainName: "nmt.in.ua",
          payUrl: "https://secure.wayforpay.com/pay",
          configured: false,
        }),
      }),
    (error: unknown) =>
      error instanceof WayForPayWebhookSignError &&
      error.code === "not_configured",
  );
});
