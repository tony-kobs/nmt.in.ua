import { getSiteUrl } from "@/constants/seo";
import { WAYFORPAY_DEFAULT_PAY_URL } from "./constants";

export type WayForPayConfig = {
  merchantAccount: string;
  merchantSecretKey: string;
  merchantDomainName: string;
  payUrl: string;
  configured: boolean;
};

export type EnvLike = {
  WAYFORPAY_MERCHANT_ACCOUNT?: string;
  WAYFORPAY_MERCHANT_SECRET_KEY?: string;
  WAYFORPAY_MERCHANT_DOMAIN?: string;
  WAYFORPAY_PAY_URL?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  [key: string]: string | undefined;
};

function hostnameFromSiteUrl(siteUrl: string): string {
  try {
    return new URL(siteUrl).hostname;
  } catch {
    return "";
  }
}

export function readWayForPayConfig(
  env: EnvLike = process.env,
): WayForPayConfig {
  // Bracket access so the bundler cannot inline empty secrets from a CI build.
  const merchantAccount = (env["WAYFORPAY_MERCHANT_ACCOUNT"] ?? "").trim();
  const merchantSecretKey = (env["WAYFORPAY_MERCHANT_SECRET_KEY"] ?? "").trim();
  const explicitDomain = (env["WAYFORPAY_MERCHANT_DOMAIN"] ?? "").trim();
  const siteUrl = (env["NEXT_PUBLIC_SITE_URL"] ?? "").trim() || getSiteUrl();
  const merchantDomainName =
    explicitDomain || hostnameFromSiteUrl(siteUrl.replace(/\/$/, ""));
  const rawPay = (env["WAYFORPAY_PAY_URL"] ?? "").trim() || WAYFORPAY_DEFAULT_PAY_URL;
  const payUrl = rawPay.replace(/\/$/, "");

  return {
    merchantAccount,
    merchantSecretKey,
    merchantDomainName,
    payUrl,
    configured:
      merchantAccount.length > 0 &&
      merchantSecretKey.length > 0 &&
      merchantDomainName.length > 0,
  };
}

export function isWayForPayConfigured(env: EnvLike = process.env): boolean {
  return readWayForPayConfig(env).configured;
}

export function teacherCheckoutUrls(origin = getSiteUrl()): {
  returnUrl: (reference: string) => string;
  failUrl: string;
  serviceUrl: string;
} {
  const base = origin.replace(/\/$/, "");
  return {
    returnUrl: (reference: string) =>
      `${base}/api/payments/wayforpay/return?ref=${encodeURIComponent(reference)}`,
    failUrl: `${base}/register/teacher/fail`,
    serviceUrl: `${base}/api/payments/wayforpay/webhook`,
  };
}
