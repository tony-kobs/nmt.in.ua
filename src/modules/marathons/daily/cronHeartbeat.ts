import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";

/** The in-process tick is every minute. Older than this means it has stopped. */
export const CRON_OK_WITHIN_MS = 5 * 60_000;
export const CRON_OK_WITHIN_MINUTES = 5;
export const SCHEDULER_HISTORY_MS = 7 * 24 * 60 * 60 * 1000;

export type SchedulerSource = "scheduler" | "http";

export type SchedulerRunInput = CronCounts & {
  ranAtMs: number;
  source: SchedulerSource;
  durationMs: number;
  error: string | null;
};

export type CronCounts = {
  processed: number;
  sent: number;
  failed: number;
};

export type CronHealth = {
  lastRunAt: string | null;
  ageMinutes: number | null;
  ok: boolean;
  lastCounts: CronCounts | null;
  pendingOutbox: number;
  failedLast24h: number;
};

type Conn = () => Promise<SqlConnection>;

/** Planner totals. `processed` is sent + skipped + failed, so a quiet tick still counts. */
export function cronCountsFromRun(result: {
  sent: number;
  skipped: number;
  failed: number;
}): CronCounts {
  return {
    processed: result.sent + result.skipped + result.failed,
    sent: result.sent,
    failed: result.failed,
  };
}

export function buildCronHealth(input: {
  now: Date;
  ranAtMs: number | null;
  counts: CronCounts | null;
  pendingOutbox: number;
  failedLast24h: number;
}): CronHealth {
  const pendingOutbox = input.pendingOutbox;
  const failedLast24h = input.failedLast24h;
  if (input.ranAtMs == null || input.counts == null || !Number.isFinite(input.ranAtMs)) {
    return {
      lastRunAt: null,
      ageMinutes: null,
      ok: false,
      lastCounts: null,
      pendingOutbox,
      failedLast24h,
    };
  }
  const ageMs = input.now.getTime() - input.ranAtMs;
  const ageMinutes = Math.max(0, Math.floor(ageMs / 60_000));
  return {
    lastRunAt: new Date(input.ranAtMs).toISOString(),
    ageMinutes,
    ok: ageMs <= CRON_OK_WITHIN_MS,
    lastCounts: input.counts,
    pendingOutbox,
    failedLast24h,
  };
}

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

async function withHeartbeat<T>(
  fn: (connection: SqlConnection) => Promise<T>,
  getConnection: Conn = loadDefaultConnection,
): Promise<T> {
  const { ensureMarathonSchema } = await import("../schema");
  await ensureMarathonSchema(getConnection);
  const connection = await getConnection();
  try {
    return await fn(connection);
  } finally {
    connection.release();
  }
}

export function schedulerErrorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, 500);
}

/** Append one history row and drop ticks older than 7 days. */
export async function writeSchedulerRun(
  connection: SqlConnection,
  input: SchedulerRunInput,
): Promise<void> {
  await connection.execute(
    `INSERT INTO marathon_scheduler_runs
       (ran_at, source, processed, sent, failed, duration_ms, error)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.ranAtMs,
      input.source,
      input.processed,
      input.sent,
      input.failed,
      input.durationMs,
      input.error,
    ],
  );
  await connection.execute(
    `DELETE FROM marathon_scheduler_runs WHERE ran_at < ?`,
    [input.ranAtMs - SCHEDULER_HISTORY_MS],
  );
}

export async function recordMarathonCronRun(
  input: SchedulerRunInput,
  getConnection?: Conn,
): Promise<void> {
  await withHeartbeat(async (connection) => {
    await writeSchedulerRun(connection, input);
  }, getConnection);
}

const FAILED_WINDOW_SQL = [
  `SELECT (
     (SELECT COUNT(*) FROM marathon_telegram_outbox
       WHERE status = 'failed' AND created_at >= UTC_TIMESTAMP() - INTERVAL 24 HOUR)
     + (SELECT COUNT(*) FROM marathon_message_jobs
       WHERE status = 'failed' AND created_at >= UTC_TIMESTAMP() - INTERVAL 24 HOUR)
     + (SELECT COUNT(*) FROM marathon_notifications
       WHERE outcome = 'failed' AND sent_at >= UTC_TIMESTAMP() - INTERVAL 24 HOUR)
   ) AS n`,
  `SELECT (
     (SELECT COUNT(*) FROM marathon_telegram_outbox
       WHERE status = 'failed' AND created_at >= UTC_TIMESTAMP() - INTERVAL 24 HOUR)
     + (SELECT COUNT(*) FROM marathon_notifications
       WHERE outcome = 'failed' AND sent_at >= UTC_TIMESTAMP() - INTERVAL 24 HOUR)
   ) AS n`,
  `SELECT COUNT(*) AS n FROM marathon_telegram_outbox
   WHERE status = 'failed' AND created_at >= UTC_TIMESTAMP() - INTERVAL 24 HOUR`,
];

function missingRelation(error: unknown): boolean {
  const errno = (error as { errno?: number }).errno;
  return errno === 1146 || errno === 1054;
}

async function countQuery(connection: SqlConnection, sql: string): Promise<number> {
  const rows = await connection.query<{ n: number | string }>(sql, []);
  return Number(rows[0]?.n ?? 0);
}

async function countFailedLast24h(connection: SqlConnection): Promise<number> {
  for (const sql of FAILED_WINDOW_SQL) {
    try {
      return await countQuery(connection, sql);
    } catch (error) {
      if (missingRelation(error)) continue;
      throw error;
    }
  }
  return 0;
}

export async function readMarathonCronHealth(
  now = new Date(),
  getConnection?: Conn,
): Promise<CronHealth> {
  return withHeartbeat(async (connection) => {
    const rows = await connection.query<{
      ran_at: number | string;
      processed: number | string;
      sent: number | string;
      failed: number | string;
    }>(
      `SELECT ran_at, processed, sent, failed
       FROM marathon_scheduler_runs
       WHERE error IS NULL
       ORDER BY ran_at DESC, id DESC
       LIMIT 1`,
      [],
    );
    const row = rows[0];
    let pendingOutbox = 0;
    try {
      pendingOutbox = await countQuery(
        connection,
        `SELECT COUNT(*) AS n FROM marathon_telegram_outbox WHERE status = 'pending'`,
      );
    } catch (error) {
      if (!missingRelation(error)) throw error;
    }
    const failedLast24h = await countFailedLast24h(connection);
    return buildCronHealth({
      now,
      ranAtMs: row ? Number(row.ran_at) : null,
      counts: row
        ? {
          processed: Number(row.processed),
          sent: Number(row.sent),
          failed: Number(row.failed),
        }
        : null,
      pendingOutbox,
      failedLast24h,
    });
  }, getConnection);
}
