import { createPublicKey, createVerify, type KeyObject } from "node:crypto";

import {
  readMonoAcquiringConfig,
  type MonoAcquiringConfig,
} from "./config";

export class MonoWebhookSignError extends Error {
  constructor(
    message: string,
    public readonly code: "not_configured" | "pubkey_fetch_failed" | "invalid_signature",
  ) {
    super(message);
    this.name = "MonoWebhookSignError";
  }
}

/**
 * Mono `/api/merchant/pubkey` returns Base64 of a PEM SPKI key.
 * Also accept raw SPKI DER Base64.
 */
export function parseMonoPublicKey(pubKeyBase64: string): KeyObject {
  const trimmed = pubKeyBase64.trim();
  const decoded = Buffer.from(trimmed, "base64");
  const asUtf8 = decoded.toString("utf8").trim();
  if (asUtf8.includes("BEGIN PUBLIC KEY")) {
    return createPublicKey(asUtf8);
  }
  if (trimmed.includes("BEGIN PUBLIC KEY")) {
    return createPublicKey(trimmed);
  }
  return createPublicKey({
    key: decoded,
    format: "der",
    type: "spki",
  });
}

/** ECDSA/SHA-256 over the raw webhook body, signature in X-Sign (Base64). */
export function verifyMonoWebhookSignature(
  body: string,
  xSignBase64: string,
  pubKeyBase64: string,
): boolean {
  if (!body || !xSignBase64.trim() || !pubKeyBase64.trim()) return false;
  try {
    const key = parseMonoPublicKey(pubKeyBase64);
    const verify = createVerify("SHA256");
    verify.update(body);
    verify.end();
    return verify.verify(key, Buffer.from(xSignBase64, "base64"));
  } catch {
    return false;
  }
}

export type FetchMonoPublicKeyDeps = {
  getConfig?: () => MonoAcquiringConfig;
  fetch?: typeof fetch;
};

export async function fetchMonoPublicKey(
  deps: FetchMonoPublicKeyDeps = {},
): Promise<string> {
  const config = (deps.getConfig ?? readMonoAcquiringConfig)();
  if (!config.configured) {
    throw new MonoWebhookSignError(
      "MONO_ACQUIRING_TOKEN is not configured.",
      "not_configured",
    );
  }

  const fetchImpl = deps.fetch ?? fetch;
  const response = await fetchImpl(`${config.baseUrl}/api/merchant/pubkey`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Token": config.token,
    },
  });

  if (!response.ok) {
    throw new MonoWebhookSignError(
      `Mono pubkey fetch failed with HTTP ${response.status}.`,
      "pubkey_fetch_failed",
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new MonoWebhookSignError(
      "Mono pubkey response was not JSON.",
      "pubkey_fetch_failed",
    );
  }

  const key =
    payload && typeof payload === "object"
      ? (payload as { key?: unknown }).key
      : undefined;
  if (typeof key !== "string" || !key.trim()) {
    throw new MonoWebhookSignError(
      "Mono pubkey response was missing key.",
      "pubkey_fetch_failed",
    );
  }
  return key.trim();
}

type CachedPubKey = { value: string; fetchedAt: number };

const PUBKEY_TTL_MS = 24 * 60 * 60 * 1000;
let cachedPubKey: CachedPubKey | null = null;

export function resetMonoPublicKeyCache(): void {
  cachedPubKey = null;
}

export type VerifyIncomingMonoWebhookDeps = FetchMonoPublicKeyDeps & {
  now?: () => number;
};

/**
 * Fetch (and cache) the merchant pubkey, then verify X-Sign.
 * On pubkey fetch failure the caller should reject the webhook.
 */
export async function verifyIncomingMonoWebhook(
  body: string,
  xSignBase64: string,
  deps: VerifyIncomingMonoWebhookDeps = {},
): Promise<boolean> {
  const now = (deps.now ?? Date.now)();
  const fresh =
    cachedPubKey && now - cachedPubKey.fetchedAt < PUBKEY_TTL_MS
      ? cachedPubKey.value
      : null;

  const tryKey = async (key: string): Promise<boolean> =>
    verifyMonoWebhookSignature(body, xSignBase64, key);

  if (fresh && (await tryKey(fresh))) {
    return true;
  }

  const fetched = await fetchMonoPublicKey(deps);
  cachedPubKey = { value: fetched, fetchedAt: now };
  return tryKey(fetched);
}
