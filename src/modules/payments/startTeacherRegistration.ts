import { findUserByLogin } from "@/modules/auth/users";
import {
  validateRegistrationInput,
  type RegistrationFieldError,
} from "@/modules/auth/validateRegistration";
import { readMonoAcquiringConfig, teacherCheckoutUrls } from "./config";
import { createMonoInvoice, MonoClientError } from "./monoClient";
import {
  attachMonoInvoice,
  createPendingTeacherPayment,
} from "./teacherPayments";

export type RegisterTeacherErrorCode =
  | RegistrationFieldError
  | "serverError"
  | "paymentNotConfigured"
  | "invoiceFailed";

export type StartTeacherRegistrationResult =
  | { ok: true; pageUrl: string; reference: string }
  | { ok: false; code: RegisterTeacherErrorCode; reference?: string };

export type StartTeacherRegistrationDeps = {
  findUserByLogin: typeof findUserByLogin;
  createPendingTeacherPayment: typeof createPendingTeacherPayment;
  attachMonoInvoice: typeof attachMonoInvoice;
  createMonoInvoice: typeof createMonoInvoice;
  getConfig: typeof readMonoAcquiringConfig;
  checkoutUrls: typeof teacherCheckoutUrls;
};

const defaultStartDeps: StartTeacherRegistrationDeps = {
  findUserByLogin,
  createPendingTeacherPayment,
  attachMonoInvoice,
  createMonoInvoice,
  getConfig: readMonoAcquiringConfig,
  checkoutUrls: teacherCheckoutUrls,
};

/**
 * Validate uniqueness, store hashed credentials as a pending payment,
 * then create a Mono invoice when the token is present.
 *
 * Without MONO_ACQUIRING_TOKEN the pending row is still saved and the
 * caller gets `paymentNotConfigured` — never an empty-token Mono request.
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
    const invoice = await deps.createMonoInvoice({
      reference: payment.reference,
      redirectUrl: urls.successUrl(payment.reference),
      webHookUrl: urls.webhookUrl,
    });
    await deps.attachMonoInvoice(payment.id, invoice.invoiceId);
    return {
      ok: true,
      pageUrl: invoice.pageUrl,
      reference: payment.reference,
    };
  } catch (error) {
    if (error instanceof MonoClientError && error.code === "not_configured") {
      return {
        ok: false,
        code: "paymentNotConfigured",
        reference: payment.reference,
      };
    }
    console.error("startTeacherRegistration: invoice failed", error);
    return {
      ok: false,
      code: "invoiceFailed",
      reference: payment.reference,
    };
  }
}
