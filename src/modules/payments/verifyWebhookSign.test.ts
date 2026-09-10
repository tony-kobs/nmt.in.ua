import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import {
  parseMonoPublicKey,
  verifyMonoWebhookSignature,
} from "./verifyWebhookSign";

const body = JSON.stringify({
  invoiceId: "p2_9ZgpZVsl3",
  status: "success",
  amount: 50000,
  ccy: 980,
  reference: "a".repeat(32),
});

test("verifyMonoWebhookSignature accepts a matching ECDSA SHA-256 signature", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const pubKeyBase64 = Buffer.from(pem).toString("base64");
  const xSign = sign("SHA256", Buffer.from(body), privateKey).toString("base64");

  assert.equal(verifyMonoWebhookSignature(body, xSign, pubKeyBase64), true);
  assert.equal(verifyMonoWebhookSignature(body + "x", xSign, pubKeyBase64), false);
  assert.equal(verifyMonoWebhookSignature(body, "AAAA", pubKeyBase64), false);
  assert.ok(parseMonoPublicKey(pubKeyBase64));
});
