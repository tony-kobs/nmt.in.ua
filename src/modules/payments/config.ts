import { getSiteUrl } from "@/constants/seo";
import { MONO_DEFAULT_BASE_URL } from "./constants";

export type MonoAcquiringConfig = {
  token: string;
  baseUrl: string;
  configured: boolean;
};

export type EnvLike = {
  MONO_ACQUIRING_TOKEN?: string;
  MONO_ACQUIRING_BASE_URL?: string;
  [key: string]: string | undefined;
};

export function readMonoAcquiringConfig(
  env: EnvLike = process.env,
): MonoAcquiringConfig {
  const token = env.MONO_ACQUIRING_TOKEN?.trim() ?? "";
  const rawBase =
    env.MONO_ACQUIRING_BASE_URL?.trim() || MONO_DEFAULT_BASE_URL;
  const baseUrl = rawBase.replace(/\/$/, "");
  return {
    token,
    baseUrl,
    configured: token.length > 0,
  };
}

export function isMonoAcquiringConfigured(env: EnvLike = process.env): boolean {
  return readMonoAcquiringConfig(env).configured;
}

export function teacherCheckoutUrls(origin = getSiteUrl()): {
  successUrl: (reference: string) => string;
  failUrl: string;
  webhookUrl: string;
} {
  const base = origin.replace(/\/$/, "");
  return {
    successUrl: (reference: string) =>
      `${base}/register/teacher/success?ref=${encodeURIComponent(reference)}`,
    failUrl: `${base}/register/teacher/fail`,
    webhookUrl: `${base}/api/payments/mono/webhook`,
  };
}
