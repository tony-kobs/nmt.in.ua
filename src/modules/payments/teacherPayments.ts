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
  MONO_CCY_UAH,
  TEACHER_FEE_KOPIYKY,
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
  monoInvoiceId: string | null;
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
  mono_invoice_id: string | null;
  user_id: number | null;
};

export type PaymentsDbDeps = {
  getConnection: () => Promise<SqlConnection>;
};

const PAYMENT_COLUMNS = `
  id, reference, login, display_name, password_hash, status,
  amount_kopiyky, ccy, mono_invoice_id, user_id
`;

const SQL_INSERT_PENDING = `
  INSERT INTO teacher_payments
    (reference, login, display_name, password_hash, status, amount_kopiyky, ccy)
  VALUES (?, ?, ?, ?, 'pending', ?, ?)
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

const SQL_FIND_BY_INVOICE = `
  SELECT ${PAYMENT_COLUMNS}
  FROM teacher_payments
  WHERE mono_invoice_id = ?
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
  SET display_name = ?, password_hash = ?, amount_kopiyky = ?, ccy = ?
  WHERE id = ? AND status = 'pending'
`;

const SQL_SET_INVOICE = `
  UPDATE teacher_payments
  SET mono_invoice_id = ?
  WHERE id = ? AND status = 'pending'
`;

const SQL_MARK_PAID = `
  UPDATE teacher_payments
  SET status = 'paid', user_id = ?, paid_at = CURRENT_TIMESTAMP, mono_invoice_id = COALESCE(?, mono_invoice_id)
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
    monoInvoiceId: row.mono_invoice_id,
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

export async function findTeacherPaymentByInvoiceId(
  invoiceId: string,
  deps: PaymentsDbDeps = defaultDeps,
): Promise<TeacherPayment | null> {
  await ensureTeacherPaymentsSchema(deps.getConnection);
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<PaymentRow>(SQL_FIND_BY_INVOICE, [
      invoiceId.trim(),
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
  const ccy = input.ccy ?? MONO_CCY_UAH;
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
      monoInvoiceId: null,
      userId: null,
    };
  } finally {
    connection.release();
  }
}

export async function attachMonoInvoice(
  paymentId: number,
  invoiceId: string,
  deps: PaymentsDbDeps = defaultDeps,
): Promise<void> {
  await ensureTeacherPaymentsSchema(deps.getConnection);
  const connection = await deps.getConnection();
  try {
    await connection.execute(SQL_SET_INVOICE, [invoiceId, paymentId]);
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
  options: { invoiceId?: string | null } = {},
  deps: PaymentsDbDeps = defaultDeps,
): Promise<ActivateTeacherResult> {
  if (
    payment.amountKopiyky !== TEACHER_FEE_KOPIYKY ||
    payment.ccy !== MONO_CCY_UAH
  ) {
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
          options.invoiceId ?? current.monoInvoiceId,
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
      options.invoiceId ?? current.monoInvoiceId,
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

export type MonoWebhookPayload = {
  invoiceId?: string;
  status?: string;
  amount?: number;
  ccy?: number;
  reference?: string;
  modifiedDate?: string;
};

export function parseMonoWebhookPayload(raw: unknown): MonoWebhookPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const payload: MonoWebhookPayload = {};
  if (typeof record.invoiceId === "string") payload.invoiceId = record.invoiceId;
  if (typeof record.status === "string") payload.status = record.status;
  if (typeof record.amount === "number") payload.amount = record.amount;
  if (typeof record.ccy === "number") payload.ccy = record.ccy;
  if (typeof record.reference === "string") payload.reference = record.reference;
  if (typeof record.modifiedDate === "string") {
    payload.modifiedDate = record.modifiedDate;
  }
  return payload;
}

const FAILURE_STATUSES = new Set(["failure", "expired", "reversed"]);

export type ApplyMonoWebhookResult = {
  handled: boolean;
  activated: boolean;
  status: string | null;
};

/**
 * Apply a verified Mono webhook. Only `status=success` creates the teacher.
 */
export async function applyMonoWebhook(
  payload: MonoWebhookPayload,
  deps: PaymentsDbDeps = defaultDeps,
): Promise<ApplyMonoWebhookResult> {
  const status = payload.status?.trim().toLowerCase() ?? "";
  let payment: TeacherPayment | null = null;
  if (payload.reference) {
    payment = await findTeacherPaymentByReference(payload.reference, deps);
  }
  if (!payment && payload.invoiceId) {
    payment = await findTeacherPaymentByInvoiceId(payload.invoiceId, deps);
  }
  if (!payment) {
    return { handled: false, activated: false, status: status || null };
  }

  if (status === "success") {
    if (
      typeof payload.amount === "number" &&
      payload.amount !== TEACHER_FEE_KOPIYKY
    ) {
      console.error("applyMonoWebhook: amount mismatch", {
        expected: TEACHER_FEE_KOPIYKY,
        received: payload.amount,
        reference: payment.reference,
      });
      return { handled: true, activated: false, status };
    }
    if (typeof payload.ccy === "number" && payload.ccy !== MONO_CCY_UAH) {
      console.error("applyMonoWebhook: currency mismatch", payload.ccy);
      return { handled: true, activated: false, status };
    }
    const result = await activatePaidTeacher(
      payment,
      { invoiceId: payload.invoiceId ?? payment.monoInvoiceId },
      deps,
    );
    return {
      handled: true,
      activated: result.ok,
      status,
    };
  }

  if (FAILURE_STATUSES.has(status) && payment.status === "pending") {
    const mapped: TeacherPaymentStatus =
      status === "expired" ? "expired" : "failed";
    const connection = await deps.getConnection();
    try {
      await connection.execute(SQL_MARK_STATUS, [mapped, payment.id]);
    } finally {
      connection.release();
    }
  }

  return { handled: true, activated: false, status };
}
