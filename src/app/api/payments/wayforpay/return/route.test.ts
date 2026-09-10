import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { GET, POST } from "./route";

const reference = "a".repeat(32);

test("GET return redirects to teacher success with ref", async () => {
  const request = new NextRequest(
    `http://localhost/api/payments/wayforpay/return?ref=${reference}`,
  );
  const response = GET(request);
  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("location"),
    `http://localhost/register/teacher/success?ref=${reference}`,
  );
});

test("POST return reads orderReference from JSON body", async () => {
  const request = new NextRequest("http://localhost/api/payments/wayforpay/return", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      orderReference: reference,
      transactionStatus: "Approved",
    }),
  });
  const response = await POST(request);
  assert.equal(response.status, 303);
  assert.match(
    response.headers.get("location") ?? "",
    new RegExp(`/register/teacher/success\\?ref=${reference}`),
  );
});
