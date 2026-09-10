import { findUserByLogin } from "@/modules/auth/users";
import {
  validateRegistrationInput,
  type RegistrationFieldError,
} from "@/modules/auth/validateRegistration";
import { readWayForPayConfig, teacherCheckoutUrls } from "./config";
import {
  buildWayForPayCheckout,
  WayForPayClientError,
  type WayForPayCheckout,
} from "./wayforpayClient";
import {
  attachExternalOrder,
  createPendingTeacherPayment,
} from "./teacherPayments";

export type RegisterTeacherErrorCode =
  | RegistrationFieldError
  | "serverError"
  | "paymentNotConfigured"
  | "invoiceFailed";

export type StartTeacherRegistrationResult =
  | { ok: true; checkout: WayForPayCheckout; reference: string }
  | { ok: false; code: RegisterTeacherErrorCode; reference?: string };

export type StartTeacherRegistrationDeps = {
  findUserByLogin: typeof findUserByLogin;
  createPendingTeacherPayment: typeof createPendingTeacherPayment;
  attachExternalOrder: typeof attachExternalOrder;
  buildCheckout: typeof buildWayForPayCheckout;
  getConfig: typeof readWayForPayConfig;
  checkoutUrls: typeof teacherCheckoutUrls;
};

const defaultStartDeps: StartTeacherRegistrationDeps = {
  findUserByLogin,
  createPendingTeacherPayment,
  attachExternalOrder,
  buildCheckout: buildWayForPayCheckout,
  getConfig: readWayForPayConfig,
  checkoutUrls: teacherCheckoutUrls,
};

/**
 * Validate uniqueness, store hashed credentials as a pending payment,
 * then sign a WayForPay Purchase form when merchant credentials are present.
 *
 * Without WAYFORPAY_MERCHANT_ACCOUNT / SECRET_KEY the pending row is still
 * saved and the caller gets `paymentNotConfigured` — never a signed checkout.
 */
export async function startTeacherRegistration(
  input: {
    login: string;
    displayName: string;
    password: string;
    passwordConfirm: string;
  },
  deps: StartTeacherRegistrationDeps = defaultStartDeps,
): Promise<StartTeacherRegistrationResult> {
  const validated = validateRegistrationInput(input);
  if (!validated.ok) {
    return { ok: false, code: validated.code };
  }

  const existing = await deps.findUserByLogin(validated.value.login);
  if (existing) {
    return { ok: false, code: "loginTaken" };
  }

  let payment;
  try {
    payment = await deps.createPendingTeacherPayment({
      login: validated.value.login,
      displayName: validated.value.displayName,
      password: validated.value.password,
    });
  } catch (error) {
    console.error("startTeacherRegistration: pending insert failed", error);
    return { ok: false, code: "serverError" };
  }

  const config = deps.getConfig();
  if (!config.configured) {
    return {
      ok: false,
      code: "paymentNotConfigured",
      reference: payment.reference,
    };
  }

  const urls = deps.checkoutUrls();
  try {
    const checkout = deps.buildCheckout({
      reference: payment.reference,
      returnUrl: urls.returnUrl(payment.reference),
      serviceUrl: urls.serviceUrl,
    });
    await deps.attachExternalOrder(payment.id, payment.reference);
    return {
      ok: true,
      checkout,
      reference: payment.reference,
    };
  } catch (error) {
    if (
      error instanceof WayForPayClientError &&
      error.code === "not_configured"
    ) {
      return {
        ok: false,
        code: "paymentNotConfigured",
        reference: payment.reference,
      };
    }
    console.error("startTeacherRegistration: checkout failed", error);
    return {
      ok: false,
      code: "invoiceFailed",
      reference: payment.reference,
    };
  }
}
