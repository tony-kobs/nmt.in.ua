import assert from "node:assert/strict";
import test from "node:test";

import type { AuthUser } from "@/modules/auth/types";
import { startTeacherRegistration } from "./startTeacherRegistration";
import type { TeacherPayment } from "./teacherPayments";
import { CCY_UAH, TEACHER_FEE_KOPIYKY } from "./constants";
import type { WayForPayCheckout } from "./wayforpayClient";

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
  ccy: CCY_UAH,
  provider: "wayforpay",
  externalOrderId: null,
  userId: null,
};

const checkout: WayForPayCheckout = {
  actionUrl: "https://secure.wayforpay.com/pay",
  fields: {
    merchantAccount: "nmt_account",
    merchantAuthType: "SimpleSignature",
    merchantDomainName: "nmt.in.ua",
    merchantTransactionSecureType: "AUTO",
    merchantSignature: "sig",
    language: "UA",
    returnUrl: `https://nmt.in.ua/api/payments/wayforpay/return?ref=${pending.reference}`,
    serviceUrl: "https://nmt.in.ua/api/payments/wayforpay/webhook",
    orderReference: pending.reference,
    orderDate: "1",
    amount: "500.00",
    currency: "UAH",
    orderLifetime: "3600",
    productName: ["Кабінет викладача nmt.in.ua"],
    productCount: ["1"],
    productPrice: ["500.00"],
  },
};

const liveConfig = {
  merchantAccount: "nmt_account",
  merchantSecretKey: "nmt-secret",
  merchantDomainName: "nmt.in.ua",
  payUrl: "https://secure.wayforpay.com/pay",
  configured: true,
};

const emptyConfig = {
  merchantAccount: "",
  merchantSecretKey: "",
  merchantDomainName: "nmt.in.ua",
  payUrl: "https://secure.wayforpay.com/pay",
  configured: false,
};

const urls = {
  returnUrl: (ref: string) =>
    `https://nmt.in.ua/api/payments/wayforpay/return?ref=${ref}`,
  failUrl: "https://nmt.in.ua/register/teacher/fail",
  serviceUrl: "https://nmt.in.ua/api/payments/wayforpay/webhook",
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
      attachExternalOrder: async () => {},
      buildCheckout: () => {
        throw new Error("should not build checkout");
      },
      getConfig: () => liveConfig,
      checkoutUrls: () => urls,
    },
  );
  assert.deepEqual(result, { ok: false, code: "invalidLogin" });
  assert.equal(created, false);
});

test("startTeacherRegistration without credentials saves pending and never signs", async () => {
  let built = false;
  const result = await startTeacherRegistration(validInput, {
    findUserByLogin: async () => null,
    createPendingTeacherPayment: async (input) => {
      assert.equal(input.login, "math_tutor");
      return pending;
    },
    attachExternalOrder: async () => {
      throw new Error("should not attach order");
    },
    buildCheckout: () => {
      built = true;
      throw new Error("should not build checkout");
    },
    getConfig: () => emptyConfig,
    checkoutUrls: () => urls,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "paymentNotConfigured");
    assert.equal(result.reference, pending.reference);
  }
  assert.equal(built, false);
});

test("startTeacherRegistration with credentials returns a signed checkout form", async () => {
  let attached: { id: number; externalOrderId: string } | null = null;
  const result = await startTeacherRegistration(validInput, {
    findUserByLogin: async () => null,
    createPendingTeacherPayment: async () => pending,
    attachExternalOrder: async (id, externalOrderId) => {
      attached = { id, externalOrderId };
    },
    buildCheckout: (checkoutInput) => {
      assert.equal(checkoutInput.reference, pending.reference);
      assert.match(checkoutInput.returnUrl, /\/api\/payments\/wayforpay\/return/);
      assert.match(checkoutInput.serviceUrl, /\/api\/payments\/wayforpay\/webhook/);
      return checkout;
    },
    getConfig: () => liveConfig,
    checkoutUrls: () => urls,
  });
  assert.deepEqual(result, {
    ok: true,
    checkout,
    reference: pending.reference,
  });
  assert.deepEqual(attached, { id: 11, externalOrderId: pending.reference });
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
    attachExternalOrder: async () => {},
    buildCheckout: () => {
      throw new Error("should not build checkout");
    },
    getConfig: () => liveConfig,
    checkoutUrls: () => urls,
  });
  assert.deepEqual(result, { ok: false, code: "loginTaken" });
});
