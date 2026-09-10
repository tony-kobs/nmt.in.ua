import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import { CCY_UAH, TEACHER_FEE_KOPIYKY } from "./constants";
import { resetTeacherPaymentsSchemaCache } from "./schema";
import {
  activatePaidTeacher,
  applyWayForPayWebhook,
  type TeacherPayment,
} from "./teacherPayments";

const reference = "c".repeat(32);
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
  status: "pending" as const,
  amount_kopiyky: TEACHER_FEE_KOPIYKY,
  ccy: CCY_UAH,
  provider: "wayforpay",
  external_order_id: reference,
  user_id: null as number | null,
};

const pendingPayment: TeacherPayment = {
  id: 7,
  reference,
  login: "math_tutor",
  displayName: "Оксана Ментор",
  passwordHash,
  status: "pending",
  amountKopiyky: TEACHER_FEE_KOPIYKY,
  ccy: CCY_UAH,
  provider: "wayforpay",
  externalOrderId: reference,
  userId: null,
};

function connectionForActivation(options: {
  paymentRow?: PaymentRowFixture;
  existingUser?: {
    id: number;
    login: string;
    password_hash: string;
    display_name: string;
    role: "student" | "teacher" | "admin";
  } | null;
  onInsertUser?: (params: unknown[]) => void;
  onMarkPaid?: (params: unknown[]) => void;
  onMarkStatus?: (params: unknown[]) => void;
}): SqlConnection {
  const paymentRow = options.paymentRow ?? pendingRow;
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
        return [paymentRow] as T[];
      }
      if (sql.includes("FROM app_users") && sql.includes("login")) {
        return (options.existingUser ? [options.existingUser] : []) as T[];
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
      if (sql.includes("SET status = ?")) {
        options.onMarkStatus?.(params);
        return { insertId: 0, affectedRows: 1 };
      }
      return { insertId: 0, affectedRows: 0 };
    },
  };
}

test("activatePaidTeacher inserts a teacher from the pending hash and marks paid", async () => {
  resetTeacherPaymentsSchemaCache();
  let inserted: unknown[] | undefined;
  let markedPaid: unknown[] | undefined;
  const connection = connectionForActivation({
    onInsertUser: (params) => {
      inserted = params;
    },
    onMarkPaid: (params) => {
      markedPaid = params;
    },
  });

  const result = await activatePaidTeacher(
    pendingPayment,
    { externalOrderId: reference },
    { getConnection: async () => connection },
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.created, true);
    assert.deepEqual(result.user, {
      id: 99,
      login: "math_tutor",
      displayName: "Оксана Ментор",
      role: "teacher",
    });
  }
  assert.ok(inserted);
  assert.equal(inserted[0], "math_tutor");
  assert.equal(inserted[1], passwordHash);
  assert.equal(inserted[2], "Оксана Ментор");
  assert.equal(inserted[3], "teacher");
  assert.ok(markedPaid);
  assert.equal(markedPaid[0], 99);
});

test("activatePaidTeacher is idempotent when the payment is already paid", async () => {
  resetTeacherPaymentsSchemaCache();
  let inserted = false;
  const paidRow = {
    ...pendingRow,
    status: "paid" as const,
    user_id: 42,
  };
  const connection = connectionForActivation({
    paymentRow: paidRow,
    onInsertUser: () => {
      inserted = true;
    },
  });

  const result = await activatePaidTeacher(
    { ...pendingPayment, status: "paid", userId: 42 },
    {},
    { getConnection: async () => connection },
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.created, false);
    assert.equal(result.user.id, 42);
    assert.equal(result.user.role, "teacher");
  }
  assert.equal(inserted, false);
});

test("applyWayForPayWebhook on Approved activates the pending teacher", async () => {
  resetTeacherPaymentsSchemaCache();
  let inserted = false;
  const connection = connectionForActivation({
    onInsertUser: () => {
      inserted = true;
    },
  });

  const result = await applyWayForPayWebhook(
    {
      orderReference: reference,
      transactionStatus: "Approved",
      amount: 500,
      currency: "UAH",
    },
    { getConnection: async () => connection },
  );

  assert.deepEqual(result, {
    handled: true,
    activated: true,
    status: "Approved",
  });
  assert.equal(inserted, true);
});

test("applyWayForPayWebhook on Declined marks pending as failed", async () => {
  resetTeacherPaymentsSchemaCache();
  let marked: unknown[] | undefined;
  const connection = connectionForActivation({
    onMarkStatus: (params) => {
      marked = params;
    },
  });

  const result = await applyWayForPayWebhook(
    {
      orderReference: reference,
      transactionStatus: "Declined",
      amount: 500,
      currency: "UAH",
    },
    { getConnection: async () => connection },
  );

  assert.deepEqual(result, {
    handled: true,
    activated: false,
    status: "Declined",
  });
  assert.deepEqual(marked, ["failed", 7]);
});
