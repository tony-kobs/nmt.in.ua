import { processDueAccountDeletions } from "@/modules/admin-profiles/accountDeletion";
import { ensureAuthSchema } from "@/modules/auth/users";
import { drainTelegramOutbox } from "@/modules/telegram/outbox";
import {
  cronCountsFromRun,
  readMarathonCronHealth,
  recordMarathonCronRun,
  schedulerErrorText,
  type CronCounts,
  type CronHealth,
  type SchedulerRunInput,
  type SchedulerSource,
} from "./cronHeartbeat";
import { isMarathonCronAuthorized, runMarathonNotifications } from "./notificationsJob";
import { marathonNotifyGate, type NotifyRun } from "./notifyLock";

export function logSchedulerTick(
  input: Pick<SchedulerRunInput, "source" | "processed" | "sent" | "failed"> & { queued?: number },
  log: (line: string) => void = console.log,
): void {
  const queued = input.queued ?? 0;
  if (input.processed <= 0 && input.failed <= 0 && queued <= 0) return;
  log(
    `marathon scheduler source=${input.source} processed=${input.processed} sent=${input.sent} failed=${input.failed} queued=${queued}`,
  );
}

type TickDeps = {
  ensureAuth?: () => Promise<void>;
  run?: typeof runMarathonNotifications;
  drain?: typeof drainTelegramOutbox;
  deletions?: () => Promise<{ deleted: number; reminded: number }>;
  record?: (input: SchedulerRunInput) => Promise<void>;
  now?: () => number;
  log?: (line: string) => void;
};

export async function performMarathonNotificationTick(
  source: SchedulerSource,
  deps: TickDeps = {},
): Promise<Response> {
  const now = deps.now ?? Date.now;
  const started = now();
  try {
    await (deps.ensureAuth ?? ensureAuthSchema)();
  } catch (error) {
    console.error("account deletion schema", error);
  }
  let result: Awaited<ReturnType<typeof runMarathonNotifications>> | null = null;
  let planError: string | null = null;
  try {
    result = await (deps.run ?? runMarathonNotifications)();
  } catch (error) {
    planError = schedulerErrorText(error);
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
  const durationMs = Math.max(0, now() - started);
  const counts: CronCounts = result
    ? cronCountsFromRun(result)
    : { processed: 0, sent: 0, failed: 0 };
  logSchedulerTick({ source, ...counts, queued }, deps.log);
  try {
    await (deps.record ?? recordMarathonCronRun)({
      ...counts,
      ranAtMs: now(),
      source,
      durationMs,
      error: planError,
    });
  } catch (error) {
    console.error("marathon cron heartbeat", error);
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

export async function handleMarathonCronHealth(
  request: Request,
  read: (now: Date) => Promise<CronHealth> = readMarathonCronHealth,
): Promise<Response> {
  if (!isMarathonCronAuthorized(request.headers.get("authorization"))) {
    return new Response(null, { status: 401 });
  }
  try {
    const health = await read(new Date());
    return Response.json(health, {
      status: health.ok ? 200 : 503,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    console.error("marathon cron health", error);
    return new Response(null, { status: 500 });
  }
}

export async function handleMarathonNotificationsProcess(
  request: Request,
  deps: TickDeps & {
    exclusive?: <T>(work: () => Promise<T>) => Promise<NotifyRun<T>>;
  } = {},
): Promise<Response> {
  if (!isMarathonCronAuthorized(request.headers.get("authorization"))) {
    return new Response(null, { status: 401 });
  }
  const exclusive = deps.exclusive ?? ((work) => marathonNotifyGate().run(work));
  try {
    const outcome = await exclusive(() => performMarathonNotificationTick("http", deps));
    if (outcome.skipped) {
      return Response.json({ skipped: true }, { headers: { "cache-control": "no-store" } });
    }
    return outcome.value;
  } catch (error) {
    console.error("marathon scheduler", error);
    return new Response(null, { status: 500 });
  }
}
