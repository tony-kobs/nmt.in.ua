import { NextResponse, type NextRequest } from "next/server";

import { isTeacherPaymentReference } from "@/modules/payments/constants";
import { parseWayForPayWebhookPayload } from "@/modules/payments/teacherPayments";

function readReference(request: NextRequest, body: unknown): string | null {
  const fromQuery = request.nextUrl.searchParams.get("ref");
  if (fromQuery && isTeacherPaymentReference(fromQuery)) return fromQuery.trim();

  const payload = parseWayForPayWebhookPayload(body);
  const fromBody = payload?.orderReference;
  if (fromBody && isTeacherPaymentReference(fromBody)) return fromBody.trim();

  return null;
}

function redirectToResult(request: NextRequest, reference: string | null) {
  const url = request.nextUrl.clone();
  url.pathname = "/register/teacher/success";
  url.search = "";
  if (reference) url.searchParams.set("ref", reference);
  return NextResponse.redirect(url, 303);
}

/**
 * WayForPay may GET or POST the payer to returnUrl.
 * Always 303 to the success page (which maps pending / paid / failed).
 */
async function handleReturn(request: NextRequest) {
  let parsed: unknown = null;
  if (request.method === "POST") {
    const text = await request.text();
    try {
      parsed = text.trim().startsWith("{")
        ? (JSON.parse(text) as unknown)
        : Object.fromEntries(new URLSearchParams(text).entries());
    } catch {
      parsed = null;
    }
  }
  return redirectToResult(request, readReference(request, parsed));
}

export function GET(request: NextRequest) {
  return redirectToResult(request, readReference(request, null));
}

export function POST(request: NextRequest) {
  return handleReturn(request);
}
