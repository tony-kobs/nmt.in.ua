import "server-only";

import { randomUUID } from "node:crypto";

import type { SqlConnection } from "@/lib/db/mysql";
import type { AuthUser } from "@/modules/auth/types";
import {
  CreateUserError,
  findUserByLogin,
  insertUserOnConnection,
} from "@/modules/auth/users";
import { hashPassword } from "@/modules/auth/password";
import {
  CCY_UAH,
  TEACHER_FEE_KOPIYKY,
  WAYFORPAY_CURRENCY,
  WAYFORPAY_PROVIDER,
  parseWayForPayAmountToKopiyky,
  type TeacherPaymentStatus,
} from "./constants";
import { ensureTeacherPaymentsSchema } from "./schema";

export type TeacherPayment = {
  id: number;
  reference: string;
  login: string;
  displayName: string;
  passwordHash: string;
  status: TeacherPaymentStatus;
  amountKopiyky: number;
  ccy: number;
  provider: string;
  externalOrderId: string | null;
  userId: number | null;
};

type PaymentRow = {
  id: number;
  reference: string;
  login: string;
  display_name: string;
  password_hash: string;
  status: TeacherPaymentStatus;
  amount_kopiyky: number;
  ccy: number;
  provider: string;
  external_order_id: string | null;
  user_id: number | null;
};

export type PaymentsDbDeps = {
  getConnection: () => Promise<SqlConnection>;
};

const PAYMENT_COLUMNS = `
  id, reference, login, display_name, password_hash, status,
  amount_kopiyky, ccy, provider, external_order_id, user_id
`;

const SQL_INSERT_PENDING = `
  INSERT INTO teacher_payments
    (reference, login, display_name, password_hash, status, amount_kopiyky, ccy, provider)
  VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
`;

const SQL_FIND_BY_REFERENCE = `
  SELECT ${PAYMENT_COLUMNS}
  FROM teacher_payments
  WHERE reference = ?
  LIMIT 1
`;

const SQL_FIND_BY_REFERENCE_FOR_UPDATE = `
  SELECT ${PAYMENT_COLUMNS}
  FROM teacher_payments
  WHERE reference = ?
  LIMIT 1
  FOR UPDATE
`;

const SQL_FIND_BY_EXTERNAL = `
  SELECT ${PAYMENT_COLUMNS}
  FROM teacher_payments
  WHERE external_order_id = ?
  LIMIT 1
`;

const SQL_FIND_PENDING_BY_LOGIN = `
  SELECT ${PAYMENT_COLUMNS}
  FROM teacher_payments
  WHERE login = ? AND status = 'pending'
  ORDER BY id DESC
  LIMIT 1
`;

const SQL_UPDATE_PENDING_CREDENTIALS = `
  UPDATE teacher_payments
  SET display_name = ?, password_hash = ?, amount_kopiyky = ?, ccy = ?, provider = ?
  WHERE id = ? AND status = 'pending'
`;

const SQL_SET_EXTERNAL = `
  UPDATE teacher_payments
  SET external_order_id = ?, provider = ?
  WHERE id = ? AND status = 'pending'
`;

const SQL_MARK_PAID = `
  UPDATE teacher_payments
  SET status = 'paid', user_id = ?, paid_at = CURRENT_TIMESTAMP,
      external_order_id = COALESCE(?, external_order_id)
  WHERE id = ?
`;

const SQL_MARK_STATUS = `
  UPDATE teacher_payments
  SET status = ?
  WHERE id = ? AND status = 'pending'
`;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

const defaultDeps: PaymentsDbDeps = { getConnection: loadDefaultConnection };

function mapPayment(row: PaymentRow): TeacherPayment {
  return {
    id: row.id,
    reference: row.reference,
    login: row.login,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    status: row.status,
    amountKopiyky: Number(row.amount_kopiyky),
    ccy: Number(row.ccy),
    provider: row.provider || WAYFORPAY_PROVIDER,
    externalOrderId: row.external_order_id,
    userId: row.user_id,
  };
}

function newReference(): string {
  return randomUUID().replace(/-/g, "");
}

export async function findTeacherPaymentByReference(
  reference: string,
  deps: PaymentsDbDeps = defaultDeps,
): Promise<TeacherPayment | null> {
  await ensureTeacherPaymentsSchema(deps.getConnection);
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<PaymentRow>(SQL_FIND_BY_REFERENCE, [
      reference.trim(),
    ]);
    const row = rows[0];
    return row ? mapPayment(row) : null;
  } finally {
    connection.release();
  }
}

export async function findTeacherPaymentByExternalOrderId(
  externalOrderId: string,
  deps: PaymentsDbDeps = defaultDeps,
): Promise<TeacherPayment | null> {
  await ensureTeacherPaymentsSchema(deps.getConnection);
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<PaymentRow>(SQL_FIND_BY_EXTERNAL, [
      externalOrderId.trim(),
    ]);
    const row = rows[0];
    return row ? mapPayment(row) : null;
  } finally {
    connection.release();
  }
}

export async function findPendingTeacherPaymentByLogin(
  login: string,
  deps: PaymentsDbDeps = defaultDeps,
): Promise<TeacherPayment | null> {
  await ensureTeacherPaymentsSchema(deps.getConnection);
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<PaymentRow>(SQL_FIND_PENDING_BY_LOGIN, [
      login.trim(),
    ]);
    const row = rows[0];
    return row ? mapPayment(row) : null;
  } finally {
    connection.release();
  }
}

export async function createPendingTeacherPayment(
  input: {
    login: string;
    displayName: string;
    password: string;
    amountKopiyky?: number;
    ccy?: number;
  },
  deps: PaymentsDbDeps = defaultDeps,
): Promise<TeacherPayment> {
  await ensureTeacherPaymentsSchema(deps.getConnection);
  const amount = input.amountKopiyky ?? TEACHER_FEE_KOPIYKY;
  const ccy = input.ccy ?? CCY_UAH;
  const passwordHash = hashPassword(input.password);

  const existing = await findPendingTeacherPaymentByLogin(input.login, deps);
  if (existing) {
    const connection = await deps.getConnection();
    try {
      await connection.execute(SQL_UPDATE_PENDING_CREDENTIALS, [
        input.displayName,
        passwordHash,
        amount,
        ccy,
        WAYFORPAY_PROVIDER,
        existing.id,
      ]);
    } finally {
      connection.release();
    }
    return {
      ...existing,
      displayName: input.displayName,
      passwordHash,
      amountKopiyky: amount,
      ccy,
      provider: WAYFORPAY_PROVIDER,
    };
  }

  const reference = newReference();
  const connection = await deps.getConnection();
  try {
    const result = await connection.execute(SQL_INSERT_PENDING, [
      reference,
      input.login,
      input.displayName,
      passwordHash,
      amount,
      ccy,
      WAYFORPAY_PROVIDER,
    ]);
    return {
      id: result.insertId,
      reference,
      login: input.login,
      displayName: input.displayName,
      passwordHash,
      status: "pending",
      amountKopiyky: amount,
      ccy,
      provider: WAYFORPAY_PROVIDER,
      externalOrderId: null,
      userId: null,
    };
  } finally {
    connection.release();
  }
}

export async function attachExternalOrder(
  paymentId: number,
  externalOrderId: string,
  deps: PaymentsDbDeps = defaultDeps,
): Promise<void> {
  await ensureTeacherPaymentsSchema(deps.getConnection);
  const connection = await deps.getConnection();
  try {
    await connection.execute(SQL_SET_EXTERNAL, [
      externalOrderId,
      WAYFORPAY_PROVIDER,
      paymentId,
    ]);
  } finally {
    connection.release();
  }
}

export type ActivateTeacherResult =
  | { ok: true; user: AuthUser; created: boolean }
  | { ok: false; code: "not_found" | "login_conflict" | "amount_mismatch" | "db_error" };

/**
 * pending → paid: insert `app_users` with role=teacher using the stored hash.
 * Idempotent when the payment is already paid.
 */
export async function activatePaidTeacher(
  payment: TeacherPayment,
  options: { externalOrderId?: string | null } = {},
  deps: PaymentsDbDeps = defaultDeps,
): Promise<ActivateTeacherResult> {
  if (payment.amountKopiyky !== TEACHER_FEE_KOPIYKY || payment.ccy !== CCY_UAH) {
    return { ok: false, code: "amount_mismatch" };
  }

  await ensureTeacherPaymentsSchema(deps.getConnection);
  const connection = await deps.getConnection();
  try {
    await connection.beginTransaction();
    const locked = await connection.query<PaymentRow>(
      SQL_FIND_BY_REFERENCE_FOR_UPDATE,
      [payment.reference],
    );
    const row = locked[0];
    if (!row) {
      await connection.rollback();
      return { ok: false, code: "not_found" };
    }
    const current = mapPayment(row);

    if (current.status === "paid" && current.userId) {
      await connection.commit();
      return {
        ok: true,
        created: false,
        user: {
          id: current.userId,
          login: current.login,
          displayName: current.displayName,
          role: "teacher",
        },
      };
    }

    const existing = await findUserByLogin(current.login, deps);
    if (existing) {
      if (existing.role === "teacher") {
        await connection.execute(SQL_MARK_PAID, [
          existing.id,
          options.externalOrderId ?? current.externalOrderId,
          current.id,
        ]);
        await connection.commit();
        return {
          ok: true,
          created: false,
          user: {
            id: existing.id,
            login: existing.login,
            displayName: existing.displayName,
            role: "teacher",
          },
        };
      }
      await connection.execute(SQL_MARK_STATUS, ["failed", current.id]);
      await connection.commit();
      return { ok: false, code: "login_conflict" };
    }

    let user: AuthUser;
    try {
      user = await insertUserOnConnection(connection, {
        login: current.login,
        displayName: current.displayName,
        passwordHash: current.passwordHash,
        role: "teacher",
      });
    } catch (error) {
      if (error instanceof CreateUserError && error.code === "login_taken") {
        await connection.execute(SQL_MARK_STATUS, ["failed", current.id]);
        await connection.commit();
        return { ok: false, code: "login_conflict" };
      }
      await connection.rollback();
      return { ok: false, code: "db_error" };
    }

    await connection.execute(SQL_MARK_PAID, [
      user.id,
      options.externalOrderId ?? current.externalOrderId,
      current.id,
    ]);
    await connection.commit();
    return { ok: true, user, created: true };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // ignore rollback errors
    }
    console.error("activatePaidTeacher: unexpected error", error);
    return { ok: false, code: "db_error" };
  } finally {
    connection.release();
  }
}

export type WayForPayWebhookPayload = {
  merchantAccount?: string;
  orderReference?: string;
  merchantSignature?: string;
  amount?: number | string;
  currency?: string;
  authCode?: string;
  cardPan?: string;
  transactionStatus?: string;
  reasonCode?: string | number;
  reason?: string;
};

function asOptionalString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

export function parseWayForPayWebhookPayload(
  raw: unknown,
): WayForPayWebhookPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const payload: WayForPayWebhookPayload = {};
  if (typeof record.merchantAccount === "string") {
    payload.merchantAccount = record.merchantAccount;
  }
  if (typeof record.orderReference === "string") {
    payload.orderReference = record.orderReference;
  }
  if (typeof record.merchantSignature === "string") {
    payload.merchantSignature = record.merchantSignature;
  }
  if (typeof record.amount === "number" || typeof record.amount === "string") {
    payload.amount = record.amount;
  }
  if (typeof record.currency === "string") payload.currency = record.currency;
  const authCode = asOptionalString(record.authCode);
  if (authCode !== undefined) payload.authCode = authCode;
  if (typeof record.cardPan === "string") payload.cardPan = record.cardPan;
  if (typeof record.transactionStatus === "string") {
    payload.transactionStatus = record.transactionStatus;
  }
  if (
    typeof record.reasonCode === "string" ||
    typeof record.reasonCode === "number"
  ) {
    payload.reasonCode = record.reasonCode;
  }
  if (typeof record.reason === "string") payload.reason = record.reason;
  return payload;
}

const FAILURE_STATUSES: Record<string, TeacherPaymentStatus> = {
  declined: "failed",
  expired: "expired",
  refunded: "cancelled",
  voided: "cancelled",
};

export type ApplyWayForPayWebhookResult = {
  handled: boolean;
  activated: boolean;
  status: string | null;
};

/**
 * Apply a verified WayForPay serviceUrl callback.
 * Only `transactionStatus=Approved` creates the teacher.
 */
export async function applyWayForPayWebhook(
  payload: WayForPayWebhookPayload,
  deps: PaymentsDbDeps = defaultDeps,
): Promise<ApplyWayForPayWebhookResult> {
  const status = payload.transactionStatus?.trim() ?? "";
  const statusKey = status.toLowerCase();
  let payment: TeacherPayment | null = null;
  if (payload.orderReference) {
    payment = await findTeacherPaymentByReference(payload.orderReference, deps);
  }
  if (!payment && payload.orderReference) {
    payment = await findTeacherPaymentByExternalOrderId(
      payload.orderReference,
      deps,
    );
  }
  if (!payment) {
    return { handled: false, activated: false, status: status || null };
  }

  if (statusKey === "approved") {
    const amountKopiyky = parseWayForPayAmountToKopiyky(payload.amount);
    if (amountKopiyky !== null && amountKopiyky !== TEACHER_FEE_KOPIYKY) {
      console.error("applyWayForPayWebhook: amount mismatch", {
        expected: TEACHER_FEE_KOPIYKY,
        received: payload.amount,
        reference: payment.reference,
      });
      return { handled: true, activated: false, status };
    }
    if (
      payload.currency &&
      payload.currency.trim().toUpperCase() !== WAYFORPAY_CURRENCY
    ) {
      console.error("applyWayForPayWebhook: currency mismatch", payload.currency);
      return { handled: true, activated: false, status };
    }
    const result = await activatePaidTeacher(
      payment,
      {
        externalOrderId: payload.orderReference ?? payment.externalOrderId,
      },
      deps,
    );
    return {
      handled: true,
      activated: result.ok,
      status,
    };
  }

  const mapped = FAILURE_STATUSES[statusKey];
  if (mapped && payment.status === "pending") {
    const connection = await deps.getConnection();
    try {
      await connection.execute(SQL_MARK_STATUS, [mapped, payment.id]);
    } finally {
      connection.release();
    }
  }

  return { handled: true, activated: false, status: status || null };
}
