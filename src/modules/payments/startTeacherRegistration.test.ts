import assert from "node:assert/strict";
import test from "node:test";

import type { AuthUser } from "@/modules/auth/types";
import { startTeacherRegistration } from "./startTeacherRegistration";
import type { TeacherPayment } from "./teacherPayments";
import { MONO_CCY_UAH, TEACHER_FEE_KOPIYKY } from "./constants";

const validInput = {
  login: "math_tutor",
  displayName: "Оксана Ментор",
  password: "securepass",
  passwordConfirm: "securepass",
};

const pending: TeacherPayment = {
  id: 11,
  reference: "b".repeat(32),
  login: validInput.login,
  displayName: validInput.displayName,
  passwordHash: "scrypt:salt:hash",
  status: "pending",
  amountKopiyky: TEACHER_FEE_KOPIYKY,
  ccy: MONO_CCY_UAH,
  monoInvoiceId: null,
  userId: null,
};

test("startTeacherRegistration rejects invalid login without touching storage", async () => {
  let created = false;
  const result = await startTeacherRegistration(
    { ...validInput, login: "ab" },
    {
      findUserByLogin: async () => {
        throw new Error("should not look up");
      },
      createPendingTeacherPayment: async () => {
        created = true;
        return pending;
      },
      attachMonoInvoice: async () => {},
      createMonoInvoice: async () => {
        throw new Error("should not call Mono");
      },
      getConfig: () => ({
        token: "x",
        baseUrl: "https://api.monobank.ua",
        configured: true,
      }),
      checkoutUrls: () => ({
        successUrl: (ref) => `https://nmt.in.ua/register/teacher/success?ref=${ref}`,
        failUrl: "https://nmt.in.ua/register/teacher/fail",
        webhookUrl: "https://nmt.in.ua/api/payments/mono/webhook",
      }),
    },
  );
  assert.deepEqual(result, { ok: false, code: "invalidLogin" });
  assert.equal(created, false);
});

test("startTeacherRegistration without token saves pending and never calls Mono", async () => {
  let fetchLikeCalled = false;
  const result = await startTeacherRegistration(validInput, {
    findUserByLogin: async () => null,
    createPendingTeacherPayment: async (input) => {
      assert.equal(input.login, "math_tutor");
      return pending;
    },
    attachMonoInvoice: async () => {
      throw new Error("should not attach invoice");
    },
    createMonoInvoice: async () => {
      fetchLikeCalled = true;
      throw new Error("should not call Mono");
    },
    getConfig: () => ({
      token: "",
      baseUrl: "https://api.monobank.ua",
      configured: false,
    }),
    checkoutUrls: () => ({
      successUrl: (ref) => `https://nmt.in.ua/register/teacher/success?ref=${ref}`,
      failUrl: "https://nmt.in.ua/register/teacher/fail",
      webhookUrl: "https://nmt.in.ua/api/payments/mono/webhook",
    }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "paymentNotConfigured");
    assert.equal(result.reference, pending.reference);
  }
  assert.equal(fetchLikeCalled, false);
});

test("startTeacherRegistration with token creates an invoice and returns pageUrl", async () => {
  let attached: { id: number; invoiceId: string } | null = null;
  const result = await startTeacherRegistration(validInput, {
    findUserByLogin: async () => null,
    createPendingTeacherPayment: async () => pending,
    attachMonoInvoice: async (id, invoiceId) => {
      attached = { id, invoiceId };
    },
    createMonoInvoice: async (invoiceInput) => {
      assert.equal(invoiceInput.reference, pending.reference);
      assert.match(invoiceInput.redirectUrl, /\/register\/teacher\/success/);
      assert.match(invoiceInput.webHookUrl, /\/api\/payments\/mono\/webhook/);
      return {
        invoiceId: "inv-99",
        pageUrl: "https://pay.mbnk.biz/inv-99",
      };
    },
    getConfig: () => ({
      token: "live-token",
      baseUrl: "https://api.monobank.ua",
      configured: true,
    }),
    checkoutUrls: () => ({
      successUrl: (ref) =>
        `https://nmt.in.ua/register/teacher/success?ref=${ref}`,
      failUrl: "https://nmt.in.ua/register/teacher/fail",
      webhookUrl: "https://nmt.in.ua/api/payments/mono/webhook",
    }),
  });
  assert.deepEqual(result, {
    ok: true,
    pageUrl: "https://pay.mbnk.biz/inv-99",
    reference: pending.reference,
  });
  assert.deepEqual(attached, { id: 11, invoiceId: "inv-99" });
});

test("startTeacherRegistration maps an existing app_users login to loginTaken", async () => {
  const existing: AuthUser & { passwordHash: string } = {
    id: 4,
    login: "math_tutor",
    displayName: "Taken",
    role: "student",
    passwordHash: "scrypt:x:y",
  };
  const result = await startTeacherRegistration(validInput, {
    findUserByLogin: async () => existing,
    createPendingTeacherPayment: async () => {
      throw new Error("should not insert pending");
    },
    attachMonoInvoice: async () => {},
    createMonoInvoice: async () => {
      throw new Error("should not call Mono");
    },
    getConfig: () => ({
      token: "x",
      baseUrl: "https://api.monobank.ua",
      configured: true,
    }),
    checkoutUrls: () => ({
      successUrl: (ref) => `https://nmt.in.ua/register/teacher/success?ref=${ref}`,
      failUrl: "https://nmt.in.ua/register/teacher/fail",
      webhookUrl: "https://nmt.in.ua/api/payments/mono/webhook",
    }),
  });
  assert.deepEqual(result, { ok: false, code: "loginTaken" });
});
