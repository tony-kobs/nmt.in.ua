import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { processTelegramTaskNotifications } from "./notifications";

export function isAuthorizedNotificationTrigger(header: string | null): boolean {
  const secret = process.env.TELEGRAM_NOTIFICATIONS_TRIGGER_SECRET;
  if (!secret?.trim() || !header?.startsWith("Bearer ")) return false;
  const provided = header.slice(7);
  if (!provided) return false;
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(provided), digest(secret));
}

export async function handleNotificationTrigger(
  request: Request,
  processNotifications: (deps?: Parameters<typeof processTelegramTaskNotifications>[0], batch?: Parameters<typeof processTelegramTaskNotifications>[1]) => Promise<object> = processTelegramTaskNotifications,
): Promise<Response> {
  if (!isAuthorizedNotificationTrigger(request.headers.get("authorization"))) {
    return new Response(null, { status: 401 });
  }
  const rawCursor = new URL(request.url).searchParams.get("afterAccountId") ?? "0";
  if (!/^(0|[1-9][0-9]*)$/.test(rawCursor) || !Number.isSafeInteger(Number(rawCursor))) {
    return new Response(null, { status: 400 });
  }
  try {
    const result = await processNotifications(undefined, { afterAccountId: Number(rawCursor) });
    return Response.json(result, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return new Response(null, { status: 500 });
  }
}
