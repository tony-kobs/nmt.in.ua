/**
 * Mono acquiring webhook for paid teacher registration.
 *
 * Verifies `X-Sign` (ECDSA) when a merchant token is configured.
 * On `status=success` activates the pending teacher (insert into app_users).
 */
import { NextResponse, type NextRequest } from "next/server";

import { isMonoAcquiringConfigured } from "@/modules/payments/config";
import {
  applyMonoWebhook,
  parseMonoWebhookPayload,
} from "@/modules/payments/teacherPayments";
import {
  MonoWebhookSignError,
  verifyIncomingMonoWebhook,
} from "@/modules/payments/verifyWebhookSign";

export type MonoWebhookRouteDeps = {
  verify: (body: string, xSign: string) => Promise<boolean>;
  apply: typeof applyMonoWebhook;
  isConfigured: () => boolean;
};

const defaultDeps: MonoWebhookRouteDeps = {
  verify: verifyIncomingMonoWebhook,
  apply: applyMonoWebhook,
  isConfigured: () => isMonoAcquiringConfigured(),
};

function readXSign(headers: Headers): string {
  return (headers.get("x-sign") ?? headers.get("X-Sign") ?? "").trim();
}

export async function POST(
  request: NextRequest,
  _context?: unknown,
  deps: MonoWebhookRouteDeps = defaultDeps,
) {
  const body = await request.text();
  const xSign = readXSign(request.headers);

  if (!deps.isConfigured()) {
    console.error("Mono webhook: MONO_ACQUIRING_TOKEN is not configured.");
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  if (!xSign) {
    return NextResponse.json({ ok: false, error: "missing_signature" }, { status: 401 });
  }

  let verified = false;
  try {
    verified = await deps.verify(body, xSign);
  } catch (error) {
    if (error instanceof MonoWebhookSignError && error.code === "pubkey_fetch_failed") {
      console.error("Mono webhook: pubkey fetch failed", error);
      return NextResponse.json({ ok: false, error: "pubkey_unavailable" }, { status: 503 });
    }
    if (error instanceof MonoWebhookSignError && error.code === "not_configured") {
      console.error("Mono webhook: token missing during verify");
      return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
    }
    console.error("Mono webhook: signature check failed", error);
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  if (!verified) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const payload = parseMonoWebhookPayload(parsed);
  if (!payload) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  try {
    const result = await deps.apply(payload);
    return NextResponse.json({
      ok: true,
      handled: result.handled,
      activated: result.activated,
    });
  } catch (error) {
    console.error("Mono webhook: apply failed", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
