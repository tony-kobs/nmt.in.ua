import { isMarathonCronAuthorized, runMarathonNotifications } from "@/modules/marathons/daily/notificationsJob";
import { drainTelegramOutbox } from "@/modules/telegram/outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  if (!isMarathonCronAuthorized(request.headers.get("authorization"))) {
    return new Response(null, { status: 401 });
  }
  try {
    const result = await runMarathonNotifications();
    const queued = await drainTelegramOutbox({ budgetMs: 8_000 });
    return Response.json({ ...result, telegramQueued: queued }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("marathon notifications", error);
    return new Response(null, { status: 500 });
  }
}
