import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMonoInvoiceRequestBody,
  createMonoInvoice,
  MonoClientError,
} from "./monoClient";
import { MONO_CCY_UAH, TEACHER_FEE_KOPIYKY } from "./constants";

const input = {
  reference: "a".repeat(32),
  redirectUrl: "https://nmt.in.ua/register/teacher/success?ref=" + "a".repeat(32),
  webHookUrl: "https://nmt.in.ua/api/payments/mono/webhook",
};

test("buildMonoInvoiceRequestBody uses kopiyky, UAH, reference and callback URLs", () => {
  const body = buildMonoInvoiceRequestBody(input);
  assert.equal(body.amount, TEACHER_FEE_KOPIYKY);
  assert.equal(body.ccy, MONO_CCY_UAH);
  assert.equal(body.merchantPaymInfo.reference, input.reference);
  assert.equal(body.redirectUrl, input.redirectUrl);
  assert.equal(body.webHookUrl, input.webHookUrl);
  assert.equal(body.validity, 3600);
});

test("createMonoInvoice does not call fetch when the token is empty", async () => {
  let called = false;
  await assert.rejects(
    () =>
      createMonoInvoice(input, {
        getConfig: () => ({
          token: "   ",
          baseUrl: "https://api.monobank.ua",
          configured: false,
        }),
        fetch: async () => {
          called = true;
          return new Response("{}", { status: 200 });
        },
      }),
    (error: unknown) =>
      error instanceof MonoClientError && error.code === "not_configured",
  );
  assert.equal(called, false);
});

test("createMonoInvoice shapes POST /api/merchant/invoice/create", async () => {
  let url = "";
  let init: RequestInit | undefined;
  const invoice = await createMonoInvoice(input, {
    getConfig: () => ({
      token: "test-token",
      baseUrl: "https://api.monobank.ua",
      configured: true,
    }),
    fetch: async (requestUrl, requestInit) => {
      url = String(requestUrl);
      init = requestInit;
      return new Response(
        JSON.stringify({
          invoiceId: "p2_testInvoice",
          pageUrl: "https://pay.mbnk.biz/p2_testInvoice",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  });

  assert.equal(url, "https://api.monobank.ua/api/merchant/invoice/create");
  assert.equal(init?.method, "POST");
  const headers = new Headers(init?.headers);
  assert.equal(headers.get("X-Token"), "test-token");
  assert.equal(headers.get("Content-Type"), "application/json");
  const body = JSON.parse(String(init?.body)) as {
    amount: number;
    ccy: number;
    merchantPaymInfo: { reference: string; destination: string };
    redirectUrl: string;
    webHookUrl: string;
  };
  assert.equal(body.amount, 50_000);
  assert.equal(body.ccy, 980);
  assert.equal(body.merchantPaymInfo.reference, input.reference);
  assert.match(body.merchantPaymInfo.destination, /викладач/i);
  assert.equal(body.redirectUrl, input.redirectUrl);
  assert.equal(body.webHookUrl, input.webHookUrl);
  assert.deepEqual(invoice, {
    invoiceId: "p2_testInvoice",
    pageUrl: "https://pay.mbnk.biz/p2_testInvoice",
  });
});

test("createMonoInvoice rejects a non-https pageUrl without exposing the token", async () => {
  await assert.rejects(
    () =>
      createMonoInvoice(input, {
        getConfig: () => ({
          token: "test-token",
          baseUrl: "https://api.monobank.ua",
          configured: true,
        }),
        fetch: async () =>
          new Response(
            JSON.stringify({
              invoiceId: "inv",
              pageUrl: "http://evil.example/pay",
            }),
            { status: 200 },
          ),
      }),
    (error: unknown) =>
      error instanceof MonoClientError && error.code === "invalid_response",
  );
});
