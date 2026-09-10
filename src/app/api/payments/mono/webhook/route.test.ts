import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { POST } from "./route";
import { TEACHER_FEE_KOPIYKY, MONO_CCY_UAH } from "@/modules/payments/constants";
import type { MonoWebhookPayload } from "@/modules/payments/teacherPayments";

const payload = {
  invoiceId: "p2_test",
  status: "success",
  amount: TEACHER_FEE_KOPIYKY,
  ccy: MONO_CCY_UAH,
  reference: "d".repeat(32),
};

function requestWith(body: string, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/payments/mono/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

test("POST webhook happy path verifies signature and activates on success", async () => {
  const applied: MonoWebhookPayload[] = [];
  const response = await POST(
    requestWith(JSON.stringify(payload), { "x-sign": "dGVzdA==" }),
    undefined,
    {
      isConfigured: () => true,
      verify: async (body, xSign) => {
        assert.equal(JSON.parse(body).status, "success");
        assert.equal(xSign, "dGVzdA==");
        return true;
      },
      apply: async (incoming) => {
        applied.push(incoming);
        return { handled: true, activated: true, status: "success" };
      },
    },
  );

  assert.equal(response.status, 200);
  const json = (await response.json()) as {
    ok: boolean;
    activated: boolean;
    handled: boolean;
  };
  assert.deepEqual(json, { ok: true, handled: true, activated: true });
  assert.equal(applied.length, 1);
  assert.equal(applied[0]?.reference, payload.reference);
  assert.equal(applied[0]?.status, "success");
});

test("POST webhook returns 503 without calling Mono or apply when token is missing", async () => {
  let verified = false;
  let applied = false;
  const response = await POST(
    requestWith(JSON.stringify(payload), { "x-sign": "dGVzdA==" }),
    undefined,
    {
      isConfigured: () => false,
      verify: async () => {
        verified = true;
        return true;
      },
      apply: async () => {
        applied = true;
        return { handled: true, activated: true, status: "success" };
      },
    },
  );
  assert.equal(response.status, 503);
  assert.equal(verified, false);
  assert.equal(applied, false);
});

test("POST webhook rejects an invalid signature", async () => {
  let applied = false;
  const response = await POST(
    requestWith(JSON.stringify(payload), { "x-sign": "nope" }),
    undefined,
    {
      isConfigured: () => true,
      verify: async () => false,
      apply: async () => {
        applied = true;
        return { handled: true, activated: true, status: "success" };
      },
    },
  );
  assert.equal(response.status, 401);
  assert.equal(applied, false);
});
