import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAcceptResponse,
  hmacMd5Hex,
  purchaseSignatureString,
  signCallback,
  signPurchase,
  verifyCallbackSignature,
} from "./signature";

// Published WayForPay wiki example (not a live merchant secret).
const WIKI_SECRET = "dhkq3vUi94{Z!5frxs(02ML";
const WIKI_PURCHASE =
  "test_merchant;www.market.ua;DH783023;1415379863;1547.36;UAH;Процесор Intel Core i5-4670 3.4GHz;Пам'ять Kingston DDR3-1600 4096MB PC3-12800;1;1;1000;547.36";

test("hmacMd5Hex matches Node crypto of the official Purchase example string", () => {
  assert.equal(
    hmacMd5Hex(WIKI_SECRET, WIKI_PURCHASE),
    "4941ea0c7f5b4833c2bd06b1fefcdc0b",
  );
});

test("signPurchase concatenates product arrays in wiki order", () => {
  const input = {
    merchantAccount: "test_merchant",
    merchantDomainName: "www.market.ua",
    orderReference: "DH783023",
    orderDate: "1415379863",
    amount: "1547.36",
    currency: "UAH",
    productName: [
      "Процесор Intel Core i5-4670 3.4GHz",
      "Пам'ять Kingston DDR3-1600 4096MB PC3-12800",
    ],
    productCount: ["1", "1"],
    productPrice: ["1000", "547.36"],
  };
  assert.equal(purchaseSignatureString(input), WIKI_PURCHASE);
  assert.equal(signPurchase(WIKI_SECRET, input), hmacMd5Hex(WIKI_SECRET, WIKI_PURCHASE));
});

test("verifyCallbackSignature accepts a matching HMAC and rejects tampering", () => {
  const callback = {
    merchantAccount: "test_merchant",
    orderReference: "a".repeat(32),
    amount: "500.00",
    currency: "UAH",
    authCode: "541963",
    cardPan: "41****8217",
    transactionStatus: "Approved",
    reasonCode: "1100",
  };
  const signature = signCallback("test-secret", callback);
  assert.equal(verifyCallbackSignature("test-secret", callback, signature), true);
  assert.equal(
    verifyCallbackSignature("test-secret", { ...callback, amount: "1.00" }, signature),
    false,
  );
  assert.equal(verifyCallbackSignature("other-secret", callback, signature), false);
});

test("buildAcceptResponse signs orderReference;accept;time", () => {
  const response = buildAcceptResponse("test-secret", "DH783023", 1415379863);
  assert.deepEqual(
    { orderReference: response.orderReference, status: response.status, time: response.time },
    { orderReference: "DH783023", status: "accept", time: 1415379863 },
  );
  assert.equal(
    response.signature,
    hmacMd5Hex("test-secret", "DH783023;accept;1415379863"),
  );
});
