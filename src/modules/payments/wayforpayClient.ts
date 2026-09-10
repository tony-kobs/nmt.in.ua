import {
  TEACHER_FEE_KOPIYKY,
  WAYFORPAY_CURRENCY,
  formatWayForPayAmount,
  isAllowedWayForPayCheckoutUrl,
} from "./constants";
import {
  readWayForPayConfig,
  type WayForPayConfig,
} from "./config";
import { signPurchase } from "./signature";

export class WayForPayClientError extends Error {
  constructor(
    message: string,
    public readonly code: "not_configured" | "invalid_checkout",
  ) {
    super(message);
    this.name = "WayForPayClientError";
  }
}

export type WayForPayCheckoutFields = {
  merchantAccount: string;
  merchantAuthType: "SimpleSignature";
  merchantDomainName: string;
  merchantTransactionSecureType: "AUTO";
  merchantSignature: string;
  language: "UA";
  returnUrl: string;
  serviceUrl: string;
  orderReference: string;
  orderDate: string;
  amount: string;
  currency: typeof WAYFORPAY_CURRENCY;
  orderLifetime: string;
  productName: string[];
  productCount: string[];
  productPrice: string[];
};

export type WayForPayCheckout = {
  actionUrl: string;
  fields: WayForPayCheckoutFields;
};

export type CreateWayForPayCheckoutInput = {
  reference: string;
  returnUrl: string;
  serviceUrl: string;
  amountKopiyky?: number;
  orderDateUnix?: number;
  productName?: string;
};

export type CreateWayForPayCheckoutDeps = {
  getConfig?: () => WayForPayConfig;
};

const DEFAULT_PRODUCT = "Кабінет викладача nmt.in.ua";
const ORDER_LIFETIME_SEC = 3600;

export function buildWayForPayCheckout(
  input: CreateWayForPayCheckoutInput,
  deps: CreateWayForPayCheckoutDeps = {},
): WayForPayCheckout {
  const config = (deps.getConfig ?? readWayForPayConfig)();
  if (!config.configured) {
    throw new WayForPayClientError(
      "WAYFORPAY_MERCHANT_ACCOUNT / WAYFORPAY_MERCHANT_SECRET_KEY is not configured.",
      "not_configured",
    );
  }

  const amountKopiyky = input.amountKopiyky ?? TEACHER_FEE_KOPIYKY;
  const amount = formatWayForPayAmount(amountKopiyky);
  const productName = input.productName ?? DEFAULT_PRODUCT;
  const productCount = "1";
  const productPrice = amount;
  const orderDate = String(
    input.orderDateUnix ?? Math.floor(Date.now() / 1000),
  );

  const signatureInput = {
    merchantAccount: config.merchantAccount,
    merchantDomainName: config.merchantDomainName,
    orderReference: input.reference,
    orderDate,
    amount,
    currency: WAYFORPAY_CURRENCY,
    productName: [productName],
    productCount: [productCount],
    productPrice: [productPrice],
  };

  const fields: WayForPayCheckoutFields = {
    merchantAccount: config.merchantAccount,
    merchantAuthType: "SimpleSignature",
    merchantDomainName: config.merchantDomainName,
    merchantTransactionSecureType: "AUTO",
    merchantSignature: signPurchase(config.merchantSecretKey, signatureInput),
    language: "UA",
    returnUrl: input.returnUrl,
    serviceUrl: input.serviceUrl,
    orderReference: input.reference,
    orderDate,
    amount,
    currency: WAYFORPAY_CURRENCY,
    orderLifetime: String(ORDER_LIFETIME_SEC),
    productName: [productName],
    productCount: [productCount],
    productPrice: [productPrice],
  };

  if (!isAllowedWayForPayCheckoutUrl(config.payUrl, config.payUrl)) {
    throw new WayForPayClientError(
      "WAYFORPAY_PAY_URL must be https.",
      "invalid_checkout",
    );
  }

  return { actionUrl: config.payUrl, fields };
}
