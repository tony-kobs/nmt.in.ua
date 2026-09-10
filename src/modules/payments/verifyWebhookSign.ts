import {
  readWayForPayConfig,
  type WayForPayConfig,
} from "./config";
import {
  verifyCallbackSignature,
  type CallbackSignatureInput,
} from "./signature";
import type { WayForPayWebhookPayload } from "./teacherPayments";

export class WayForPayWebhookSignError extends Error {
  constructor(
    message: string,
    public readonly code: "not_configured" | "invalid_signature",
  ) {
    super(message);
    this.name = "WayForPayWebhookSignError";
  }
}

export function callbackInputFromPayload(
  payload: WayForPayWebhookPayload,
): CallbackSignatureInput | null {
  if (
    typeof payload.merchantAccount !== "string" ||
    typeof payload.orderReference !== "string" ||
    payload.amount === undefined ||
    typeof payload.currency !== "string" ||
    typeof payload.transactionStatus !== "string"
  ) {
    return null;
  }

  return {
    merchantAccount: payload.merchantAccount,
    orderReference: payload.orderReference,
    amount: payload.amount,
    currency: payload.currency,
    authCode: payload.authCode ?? "",
    cardPan: payload.cardPan ?? "",
    transactionStatus: payload.transactionStatus,
    reasonCode: payload.reasonCode ?? "",
  };
}

export type VerifyIncomingWayForPayWebhookDeps = {
  getConfig?: () => WayForPayConfig;
};

/**
 * Verify HMAC_MD5 merchantSignature on a parsed serviceUrl callback.
 */
export function verifyIncomingWayForPayWebhook(
  payload: WayForPayWebhookPayload,
  deps: VerifyIncomingWayForPayWebhookDeps = {},
): boolean {
  const config = (deps.getConfig ?? readWayForPayConfig)();
  if (!config.configured) {
    throw new WayForPayWebhookSignError(
      "WAYFORPAY_MERCHANT_ACCOUNT / WAYFORPAY_MERCHANT_SECRET_KEY is not configured.",
      "not_configured",
    );
  }

  const received = payload.merchantSignature ?? "";
  const input = callbackInputFromPayload(payload);
  if (!input || !received.trim()) return false;
  return verifyCallbackSignature(config.merchantSecretKey, input, received);
}
