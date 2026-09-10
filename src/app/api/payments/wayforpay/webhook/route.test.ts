import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { POST } from "./route";
import { TEACHER_FEE_UAH } from "@/modules/payments/constants";
import type { WayForPayWebhookPayload } from "@/modules/payments/teacherPayments";

const payload: WayForPayWebhookPayload = {
  merchantAccount: "test_merchant",
  orderReference: "d".repeat(32),
  merchantSignature: "abc",
  amount: TEACHER_FEE_UAH,
  currency: "UAH",
  authCode: "541963",
  cardPan: "41****8217",
  transactionStatus: "Approved",
  reasonCode: "1100",
};

function requestWith(body: string, contentType = "application/json") {
  return new NextRequest("http://localhost/api/payments/wayforpay/webhook", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

test("POST webhook happy path verifies signature and activates on Approved", async () => {
  const applied: WayForPayWebhookPayload[] = [];
  const response = await POST(
    requestWith(JSON.stringify(payload)),
    undefined,
    {
      isConfigured: () => true,
      verify: (incoming) => {
        assert.equal(incoming.transactionStatus, "Approved");
        assert.equal(incoming.orderReference, payload.orderReference);
        return true;
      },
      apply: async (incoming) => {
        applied.push(incoming);
        return { handled: true, activated: true, status: "Approved" };
      },
      accept: (orderReference) => ({
        orderReference,
        status: "accept",
        time: 1415379863,
        signature: "signed",
      }),
    },
  );

  assert.equal(response.status, 200);
  const json = (await response.json()) as {
    ok: boolean;
    activated: boolean;
    handled: boolean;
    status: string;
    orderReference: string;
    signature: string;
  };
  assert.equal(json.ok, true);
  assert.equal(json.handled, true);
  assert.equal(json.activated, true);
  assert.equal(json.status, "accept");
  assert.equal(json.orderReference, payload.orderReference);
  assert.equal(json.signature, "signed");
  assert.equal(applied.length, 1);
});

test("POST webhook returns 503 without verifying when credentials are missing", async () => {
  let verified = false;
  let applied = false;
  const response = await POST(requestWith(JSON.stringify(payload)), undefined, {
    isConfigured: () => false,
    verify: () => {
      verified = true;
      return true;
    },
    apply: async () => {
      applied = true;
      return { handled: true, activated: true, status: "Approved" };
    },
    accept: (orderReference) => ({
      orderReference,
      status: "accept",
      time: 1,
      signature: "x",
    }),
  });
  assert.equal(response.status, 503);
  assert.equal(verified, false);
  assert.equal(applied, false);
});

test("POST webhook rejects an invalid signature", async () => {
  let applied = false;
  const response = await POST(requestWith(JSON.stringify(payload)), undefined, {
    isConfigured: () => true,
    verify: () => false,
    apply: async () => {
      applied = true;
      return { handled: true, activated: true, status: "Approved" };
    },
    accept: (orderReference) => ({
      orderReference,
      status: "accept",
      time: 1,
      signature: "x",
    }),
  });
  assert.equal(response.status, 401);
  assert.equal(applied, false);
});
