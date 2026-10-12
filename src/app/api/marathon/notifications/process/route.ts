import { isMarathonCronAuthorized, runMarathonNotifications } from "@/modules/marathons/daily/notificationsJob";
import { drainTelegramOutbox } from "@/modules/telegram/outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  if (!isMarathonCronAuthorized(request.headers.get("authorization"))) {
    return new Response(null, { status: 401 });
  }
  const started = Date.now();
  let result: Awaited<ReturnType<typeof runMarathonNotifications>> | null = null;
  try {
    result = await runMarathonNotifications();
  } catch (error) {
    console.error("marathon notifications", error);
  }
  // The outbox carries day content; drain it even when planning failed. Stay well under maxDuration.
  let queued = 0;
  let drainFailed = false;
  try {
    queued = await drainTelegramOutbox({ budgetMs: Math.max(5_000, 45_000 - (Date.now() - started)) });
  } catch (error) {
    drainFailed = true;
    console.error("marathon telegram outbox", error);
  }
  if (!result) return new Response(null, { status: 500 });
  return Response.json(
    { ...result, telegramQueued: queued, ...(drainFailed ? { outboxFailed: true } : {}) },
    { headers: { "cache-control": "no-store" } },
  );
}
