import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWayForPayCheckout,
  WayForPayClientError,
} from "./wayforpayClient";
import { TEACHER_FEE_KOPIYKY, formatWayForPayAmount } from "./constants";
import { signPurchase } from "./signature";

const reference = "a".repeat(32);
const input = {
  reference,
  returnUrl: `https://nmt.in.ua/api/payments/wayforpay/return?ref=${reference}`,
  serviceUrl: "https://nmt.in.ua/api/payments/wayforpay/webhook",
  orderDateUnix: 1_415_379_863,
};

const liveConfig = {
  merchantAccount: "nmt_account",
  merchantSecretKey: "nmt-secret",
  merchantDomainName: "nmt.in.ua",
  payUrl: "https://secure.wayforpay.com/pay",
  configured: true,
};

test("buildWayForPayCheckout does not sign when credentials are missing", () => {
  assert.throws(
    () =>
      buildWayForPayCheckout(input, {
        getConfig: () => ({
          merchantAccount: "",
          merchantSecretKey: "",
          merchantDomainName: "nmt.in.ua",
          payUrl: "https://secure.wayforpay.com/pay",
          configured: false,
        }),
      }),
    (error: unknown) =>
      error instanceof WayForPayClientError && error.code === "not_configured",
  );
});

test("buildWayForPayCheckout signs Purchase fields with 500.00 UAH", () => {
  const checkout = buildWayForPayCheckout(input, { getConfig: () => liveConfig });
  assert.equal(checkout.actionUrl, "https://secure.wayforpay.com/pay");
  const { fields } = checkout;
  assert.equal(fields.merchantAccount, "nmt_account");
  assert.equal(fields.merchantAuthType, "SimpleSignature");
  assert.equal(fields.merchantDomainName, "nmt.in.ua");
  assert.equal(fields.merchantTransactionSecureType, "AUTO");
  assert.equal(fields.orderReference, reference);
  assert.equal(fields.orderDate, "1415379863");
  assert.equal(fields.amount, formatWayForPayAmount(TEACHER_FEE_KOPIYKY));
  assert.equal(fields.currency, "UAH");
  assert.equal(fields.returnUrl, input.returnUrl);
  assert.equal(fields.serviceUrl, input.serviceUrl);
  assert.deepEqual(fields.productName, ["Кабінет викладача nmt.in.ua"]);
  assert.deepEqual(fields.productCount, ["1"]);
  assert.deepEqual(fields.productPrice, ["500.00"]);
  assert.equal(
    fields.merchantSignature,
    signPurchase("nmt-secret", {
      merchantAccount: "nmt_account",
      merchantDomainName: "nmt.in.ua",
      orderReference: reference,
      orderDate: "1415379863",
      amount: "500.00",
      currency: "UAH",
      productName: fields.productName,
      productCount: fields.productCount,
      productPrice: fields.productPrice,
    }),
  );
  assert.equal(fields.merchantSignature.includes("nmt-secret"), false);
});
