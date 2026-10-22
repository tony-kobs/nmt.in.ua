import { processDueAccountDeletions } from "@/modules/admin-profiles/accountDeletion";
import { ensureAuthSchema } from "@/modules/auth/users";
import { drainTelegramOutbox } from "@/modules/telegram/outbox";
import { cronCountsFromRun, readMarathonCronHealth, recordMarathonCronRun, type CronCounts, type CronHealth } from "./cronHeartbeat";
import { isMarathonCronAuthorized, runMarathonNotifications } from "./notificationsJob";

export async function handleMarathonCronHealth(
  request: Request,
  read: (now: Date) => Promise<CronHealth> = readMarathonCronHealth,
): Promise<Response> {
  if (!isMarathonCronAuthorized(request.headers.get("authorization"))) {
    return new Response(null, { status: 401 });
  }
  try {
    const health = await read(new Date());
    return Response.json(health, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("marathon cron health", error);
    return new Response(null, { status: 500 });
  }
}

export async function handleMarathonNotificationsProcess(
  request: Request,
  deps: {
    ensureAuth?: () => Promise<void>;
    run?: typeof runMarathonNotifications;
    drain?: typeof drainTelegramOutbox;
    deletions?: () => Promise<{ deleted: number; reminded: number }>;
    record?: (counts: CronCounts) => Promise<void>;
    now?: () => number;
  } = {},
): Promise<Response> {
  if (!isMarathonCronAuthorized(request.headers.get("authorization"))) {
    return new Response(null, { status: 401 });
  }
  const now = deps.now ?? Date.now;
  const started = now();
  try {
    await (deps.ensureAuth ?? ensureAuthSchema)();
  } catch (error) {
    console.error("account deletion schema", error);
  }
  let result: Awaited<ReturnType<typeof runMarathonNotifications>> | null = null;
  try {
    result = await (deps.run ?? runMarathonNotifications)();
  } catch (error) {
    console.error("marathon notifications", error);
  }
  // The outbox carries day content; drain it even when planning failed. Stay well under maxDuration.
  let queued = 0;
  let drainFailed = false;
  try {
    const drain = deps.drain ?? drainTelegramOutbox;
    queued = await drain({ budgetMs: Math.max(5_000, 45_000 - (now() - started)) });
  } catch (error) {
    drainFailed = true;
    console.error("marathon telegram outbox", error);
  }
  let deletion = { deleted: 0, reminded: 0 };
  try {
    if (deps.deletions) {
      deletion = await deps.deletions();
    } else {
      const { getConnection } = await import("@/lib/db/mysql");
      deletion = await processDueAccountDeletions({ getConnection });
    }
  } catch (error) {
    console.error("account deletion cron", error);
  }
  if (!result) return new Response(null, { status: 500 });
  try {
    await (deps.record ?? recordMarathonCronRun)(cronCountsFromRun(result));
  } catch (error) {
    console.error("marathon cron heartbeat", error);
  }
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
