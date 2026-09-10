import { createHmac, timingSafeEqual } from "node:crypto";

export function hmacMd5Hex(secret: string, payload: string): string {
  return createHmac("md5", secret).update(payload, "utf8").digest("hex");
}

export function joinSignatureParts(parts: ReadonlyArray<string | number>): string {
  return parts.map((part) => String(part)).join(";");
}

export function signaturesMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected.trim().toLowerCase(), "utf8");
  const b = Buffer.from(received.trim().toLowerCase(), "utf8");
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type PurchaseSignatureInput = {
  merchantAccount: string;
  merchantDomainName: string;
  orderReference: string;
  orderDate: string | number;
  amount: string;
  currency: string;
  productName: readonly string[];
  productCount: readonly Array<string | number>;
  productPrice: readonly string[];
};

/**
 * Purchase HMAC_MD5:
 * merchantAccount;merchantDomainName;orderReference;orderDate;amount;currency;
 * productName[]; productCount[]; productPrice[]
 */
export function purchaseSignatureString(input: PurchaseSignatureInput): string {
  return joinSignatureParts([
    input.merchantAccount,
    input.merchantDomainName,
    input.orderReference,
    input.orderDate,
    input.amount,
    input.currency,
    ...input.productName,
    ...input.productCount,
    ...input.productPrice,
  ]);
}

export function signPurchase(
  secret: string,
  input: PurchaseSignatureInput,
): string {
  return hmacMd5Hex(secret, purchaseSignatureString(input));
}

export type CallbackSignatureInput = {
  merchantAccount: string;
  orderReference: string;
  amount: string | number;
  currency: string;
  authCode: string;
  cardPan: string;
  transactionStatus: string;
  reasonCode: string | number;
};

/**
 * serviceUrl HMAC_MD5:
 * merchantAccount;orderReference;amount;currency;authCode;cardPan;transactionStatus;reasonCode
 */
export function callbackSignatureString(input: CallbackSignatureInput): string {
  return joinSignatureParts([
    input.merchantAccount,
    input.orderReference,
    input.amount,
    input.currency,
    input.authCode,
    input.cardPan,
    input.transactionStatus,
    input.reasonCode,
  ]);
}

export function signCallback(
  secret: string,
  input: CallbackSignatureInput,
): string {
  return hmacMd5Hex(secret, callbackSignatureString(input));
}

export function verifyCallbackSignature(
  secret: string,
  input: CallbackSignatureInput,
  received: string,
): boolean {
  if (!secret || !received.trim()) return false;
  return signaturesMatch(signCallback(secret, input), received);
}

/** Merchant → WayForPay: orderReference;status;time */
export function signMerchantResponse(
  secret: string,
  orderReference: string,
  status: string,
  time: number,
): string {
  return hmacMd5Hex(secret, joinSignatureParts([orderReference, status, time]));
}

export function buildAcceptResponse(
  secret: string,
  orderReference: string,
  time = Math.floor(Date.now() / 1000),
): {
  orderReference: string;
  status: "accept";
  time: number;
  signature: string;
} {
  return {
    orderReference,
    status: "accept",
    time,
    signature: signMerchantResponse(secret, orderReference, "accept", time),
  };
}
