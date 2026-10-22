import { processDueAccountDeletions } from "@/modules/admin-profiles/accountDeletion";
import { ensureAuthSchema } from "@/modules/auth/users";
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
  try {
    await ensureAuthSchema();
  } catch (error) {
    console.error("account deletion schema", error);
  }
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
  let deletion = { deleted: 0, reminded: 0 };
  try {
    const { getConnection } = await import("@/lib/db/mysql");
    deletion = await processDueAccountDeletions({ getConnection });
  } catch (error) {
    console.error("account deletion cron", error);
  }
  if (!result) return new Response(null, { status: 500 });
  return Response.json(
    {
      ...result,
      telegramQueued: queued,
      deletionDeleted: deletion.deleted,
      deletionReminded: deletion.reminded,
      ...(drainFailed ? { outboxFailed: true } : {}),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
