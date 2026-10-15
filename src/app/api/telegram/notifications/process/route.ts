import { handleNotificationTrigger } from "@/modules/telegram/notificationTrigger";
import { drainTelegramOutbox } from "@/modules/telegram/outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const started = Date.now();
  const response = await handleNotificationTrigger(request);
  if (response.status !== 200) return response;
  let telegramQueued = 0;
  let outboxFailed = false;
  try {
    telegramQueued = await drainTelegramOutbox({
      budgetMs: Math.max(3_000, 25_000 - (Date.now() - started)),
    });
  } catch (error) {
    outboxFailed = true;
    console.error("telegram outbox", error);
  }
  const body = await response.json() as Record<string, unknown>;
  return Response.json(
    { ...body, telegramQueued, ...(outboxFailed ? { outboxFailed: true } : {}) },
    { headers: { "cache-control": "no-store" } },
  );
}
