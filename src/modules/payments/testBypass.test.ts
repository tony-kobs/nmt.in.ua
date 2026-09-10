import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import { CCY_UAH, TEACHER_FEE_KOPIYKY } from "./constants";
import { resetTeacherPaymentsSchemaCache } from "./schema";
import {
  isTeacherPaymentTestBypassEnabled,
  simulateTeacherPaymentSuccess,
} from "./testBypass";

const reference = "d".repeat(32);
const passwordHash = "scrypt:c2FsdA==:aGFzaA==";

type PaymentRowFixture = {
  id: number;
  reference: string;
  login: string;
  display_name: string;
  password_hash: string;
  status: string;
  amount_kopiyky: number;
  ccy: number;
  provider: string;
  external_order_id: string;
  user_id: number | null;
};

const pendingRow: PaymentRowFixture = {
  id: 7,
  reference,
  login: "math_tutor",
  display_name: "Оксана Ментор",
  password_hash: passwordHash,
  status: "pending",
  amount_kopiyky: TEACHER_FEE_KOPIYKY,
  ccy: CCY_UAH,
  provider: "wayforpay",
  external_order_id: reference,
  user_id: null,
};

function connectionForBypass(options: {
  paymentRow?: PaymentRowFixture | null;
  onInsertUser?: (params: unknown[]) => void;
  onMarkPaid?: (params: unknown[]) => void;
}): SqlConnection {
  const paymentRow = options.paymentRow === undefined ? pendingRow : options.paymentRow;
  return {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async <T,>(sql: string) => {
      if (sql.includes("information_schema")) {
        return [
          { COLUMN_NAME: "external_order_id" },
          { COLUMN_NAME: "provider" },
        ] as T[];
      }
      if (sql.includes("COUNT(*)")) {
        return [{ count: 3 }] as T[];
      }
      if (sql.includes("teacher_payments")) {
        return (paymentRow ? [paymentRow] : []) as T[];
      }
      if (sql.includes("FROM app_users") && sql.includes("login")) {
        return [] as T[];
      }
      return [] as T[];
    },
    execute: async (sql, params = []) => {
      if (sql.includes("INSERT INTO app_users")) {
        options.onInsertUser?.(params);
        return { insertId: 99, affectedRows: 1 };
      }
      if (sql.includes("status = 'paid'") || sql.includes("SET status = 'paid'")) {
        options.onMarkPaid?.(params);
        return { insertId: 0, affectedRows: 1 };
      }
      return { insertId: 0, affectedRows: 0 };
    },
  };
}

test("isTeacherPaymentTestBypassEnabled is on in development by default", () => {
  assert.equal(
    isTeacherPaymentTestBypassEnabled({ NODE_ENV: "development" }),
    true,
  );
  assert.equal(
    isTeacherPaymentTestBypassEnabled({
      NODE_ENV: "development",
      WAYFORPAY_MERCHANT_ACCOUNT: "live_merchant",
    }),
    true,
  );
});

test("isTeacherPaymentTestBypassEnabled is on for sandbox merchant in production", () => {
  assert.equal(
    isTeacherPaymentTestBypassEnabled({
      NODE_ENV: "production",
      WAYFORPAY_MERCHANT_ACCOUNT: "test_merch_n1",
    }),
    true,
  );
});

test("isTeacherPaymentTestBypassEnabled is off in production with a live merchant", () => {
  assert.equal(
    isTeacherPaymentTestBypassEnabled({
      NODE_ENV: "production",
      WAYFORPAY_MERCHANT_ACCOUNT: "nmt_live",
      TEACHER_PAYMENT_TEST_BYPASS: "1",
    }),
    false,
  );
  assert.equal(
    isTeacherPaymentTestBypassEnabled({ NODE_ENV: "production" }),
    false,
  );
});

test("isTeacherPaymentTestBypassEnabled honors explicit 0 even in development", () => {
  assert.equal(
    isTeacherPaymentTestBypassEnabled({
      NODE_ENV: "development",
      TEACHER_PAYMENT_TEST_BYPASS: "0",
    }),
    false,
  );
});

test("simulateTeacherPaymentSuccess activates a pending teacher", async () => {
  resetTeacherPaymentsSchemaCache();
  let inserted: unknown[] | undefined;
  let markedPaid: unknown[] | undefined;
  const connection = connectionForBypass({
    onInsertUser: (params) => {
      inserted = params;
    },
    onMarkPaid: (params) => {
      markedPaid = params;
    },
  });

  const result = await simulateTeacherPaymentSuccess(
    { reference },
    {
      getConnection: async () => connection,
      env: { NODE_ENV: "development" },
    },
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.user, {
      id: 99,
      login: "math_tutor",
      displayName: "Оксана Ментор",
      role: "teacher",
    });
  }
  assert.ok(inserted);
  assert.equal(inserted[0], "math_tutor");
  assert.equal(inserted[3], "teacher");
  assert.ok(markedPaid);
  assert.equal(markedPaid[0], 99);
});

test("simulateTeacherPaymentSuccess is blocked in production with a live merchant", async () => {
  const result = await simulateTeacherPaymentSuccess(
    { reference },
    {
      getConnection: async () => {
        throw new Error("db must not be touched when bypass is disabled");
      },
      env: {
        NODE_ENV: "production",
        WAYFORPAY_MERCHANT_ACCOUNT: "nmt_live",
        TEACHER_PAYMENT_TEST_BYPASS: "1",
      },
    },
  );
  assert.deepEqual(result, { ok: false, code: "disabled" });
});

test("simulateTeacherPaymentSuccess fails safely without a reference", async () => {
  const result = await simulateTeacherPaymentSuccess(
    { reference: null },
    {
      getConnection: async () => {
        throw new Error("db must not be touched without a reference");
      },
      env: { NODE_ENV: "development" },
    },
  );
  assert.deepEqual(result, { ok: false, code: "missing_reference" });
});

test("simulateTeacherPaymentSuccess fails safely on an invalid reference", async () => {
  const result = await simulateTeacherPaymentSuccess(
    { reference: "not-a-reference" },
    {
      getConnection: async () => {
        throw new Error("db must not be touched for an invalid reference");
      },
      env: { NODE_ENV: "development" },
    },
  );
  assert.deepEqual(result, { ok: false, code: "missing_reference" });
});

test("simulateTeacherPaymentSuccess fails safely when the payment is missing", async () => {
  resetTeacherPaymentsSchemaCache();
  const connection = connectionForBypass({ paymentRow: null });
  const result = await simulateTeacherPaymentSuccess(
    { reference },
    {
      getConnection: async () => connection,
      env: { NODE_ENV: "development" },
    },
  );
  assert.deepEqual(result, { ok: false, code: "not_found" });
});

test("simulateTeacherPaymentSuccess activates via sandbox merchant in production", async () => {
  resetTeacherPaymentsSchemaCache();
  let inserted = false;
  const connection = connectionForBypass({
    onInsertUser: () => {
      inserted = true;
    },
  });
  const result = await simulateTeacherPaymentSuccess(
    { reference },
    {
      getConnection: async () => connection,
      env: {
        NODE_ENV: "production",
        WAYFORPAY_MERCHANT_ACCOUNT: "test_merch_n1",
      },
    },
  );
  assert.equal(result.ok, true);
  assert.equal(inserted, true);
});
