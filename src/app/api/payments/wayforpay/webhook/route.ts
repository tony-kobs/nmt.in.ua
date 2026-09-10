/**
 * WayForPay serviceUrl for paid teacher registration.
 *
 * Verifies HMAC_MD5 `merchantSignature` when merchant credentials are set.
 * On `transactionStatus=Approved` activates the pending teacher (app_users).
 * Responds with the documented accept payload so WayForPay stops retrying.
 */
import { NextResponse, type NextRequest } from "next/server";

import { isWayForPayConfigured, readWayForPayConfig } from "@/modules/payments/config";
import { buildAcceptResponse } from "@/modules/payments/signature";
import {
  applyWayForPayWebhook,
  parseWayForPayWebhookPayload,
  type WayForPayWebhookPayload,
} from "@/modules/payments/teacherPayments";
import {
  WayForPayWebhookSignError,
  verifyIncomingWayForPayWebhook,
} from "@/modules/payments/verifyWebhookSign";

export type WayForPayWebhookRouteDeps = {
  verify: (payload: WayForPayWebhookPayload) => boolean;
  apply: typeof applyWayForPayWebhook;
  isConfigured: () => boolean;
  accept: (orderReference: string) => {
    orderReference: string;
    status: "accept";
    time: number;
    signature: string;
  };
};

const defaultDeps: WayForPayWebhookRouteDeps = {
  verify: verifyIncomingWayForPayWebhook,
  apply: applyWayForPayWebhook,
  isConfigured: () => isWayForPayConfigured(),
  accept: (orderReference) =>
    buildAcceptResponse(readWayForPayConfig().merchantSecretKey, orderReference),
};

function parseBody(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed) as unknown;
  }
  const params = new URLSearchParams(trimmed);
  const asRecord: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    asRecord[key] = value;
  }
  if (asRecord.transactionStatus || asRecord.orderReference) return asRecord;
  const nested = asRecord.data ?? asRecord.json;
  if (nested) return JSON.parse(nested) as unknown;
  return asRecord;
}

export async function POST(
  request: NextRequest,
  _context?: unknown,
  deps: WayForPayWebhookRouteDeps = defaultDeps,
) {
  const body = await request.text();

  if (!deps.isConfigured()) {
    console.error("WayForPay webhook: merchant credentials are not configured.");
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  let parsed: unknown;
  try {
    parsed = parseBody(body);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const payload = parseWayForPayWebhookPayload(parsed);
  if (!payload) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  let verified = false;
  try {
    verified = deps.verify(payload);
  } catch (error) {
    if (error instanceof WayForPayWebhookSignError && error.code === "not_configured") {
      console.error("WayForPay webhook: credentials missing during verify");
      return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
    }
    console.error("WayForPay webhook: signature check failed", error);
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  if (!verified) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  try {
    const result = await deps.apply(payload);
    const orderReference = payload.orderReference ?? "";
    return NextResponse.json({
      ...deps.accept(orderReference),
      ok: true,
      handled: result.handled,
      activated: result.activated,
    });
  } catch (error) {
    console.error("WayForPay webhook: apply failed", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
