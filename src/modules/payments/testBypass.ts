import "server-only";

import type { AuthUser } from "@/modules/auth/types";
import {
  WAYFORPAY_SANDBOX_MERCHANT_ACCOUNT,
  isTeacherPaymentReference,
} from "./constants";
import {
  activatePaidTeacher,
  findTeacherPaymentByReference,
  type PaymentsDbDeps,
} from "./teacherPayments";

export type TestBypassEnv = {
  NODE_ENV?: string;
  TEACHER_PAYMENT_TEST_BYPASS?: string;
  WAYFORPAY_MERCHANT_ACCOUNT?: string;
};

export type SimulateTeacherPaymentErrorCode =
  | "disabled"
  | "missing_reference"
  | "not_found"
  | "not_pending"
  | "activate_failed";

export type SimulateTeacherPaymentSuccessResult =
  | { ok: true; user: AuthUser }
  | { ok: false; code: SimulateTeacherPaymentErrorCode };

export type SimulateTeacherPaymentDeps = PaymentsDbDeps & {
  env?: TestBypassEnv;
};

function isSandboxMerchant(account: string): boolean {
  return account.trim() === WAYFORPAY_SANDBOX_MERCHANT_ACCOUNT;
}

/**
 * Dev/sandbox control that pretends WayForPay returned Approved.
 *
 * Hard safety: never on a live merchant in production — even if
 * `TEACHER_PAYMENT_TEST_BYPASS=1`. Default on when not production or when the
 * merchant is `test_merch_n1`.
 */
export function isTeacherPaymentTestBypassEnabled(
  env: TestBypassEnv = process.env,
): boolean {
  const merchant = (env.WAYFORPAY_MERCHANT_ACCOUNT ?? "").trim();
  const sandbox = isSandboxMerchant(merchant);
  const production = env.NODE_ENV === "production";

  if (production && !sandbox) {
    return false;
  }

  const flag = (env.TEACHER_PAYMENT_TEST_BYPASS ?? "").trim();
  if (flag === "0") return false;
  if (flag === "1") return true;

  return !production || sandbox;
}

export async function simulateTeacherPaymentSuccess(
  input: { reference: string | null | undefined },
  deps: SimulateTeacherPaymentDeps = {
    getConnection: async () => {
      const { getConnection } = await import("@/lib/db/mysql");
      return getConnection();
    },
  },
): Promise<SimulateTeacherPaymentSuccessResult> {
  const env = deps.env ?? process.env;
  if (!isTeacherPaymentTestBypassEnabled(env)) {
    return { ok: false, code: "disabled" };
  }

  const raw = input.reference?.trim() ?? "";
  if (!isTeacherPaymentReference(raw)) {
    return { ok: false, code: "missing_reference" };
  }

  const payment = await findTeacherPaymentByReference(raw, deps);
  if (!payment) {
    return { ok: false, code: "not_found" };
  }

  if (payment.status !== "pending" && payment.status !== "paid") {
    return { ok: false, code: "not_pending" };
  }

  const result = await activatePaidTeacher(
    payment,
    { externalOrderId: payment.externalOrderId ?? payment.reference },
    deps,
  );
  if (!result.ok) {
    return { ok: false, code: "activate_failed" };
  }

  return { ok: true, user: result.user };
}
