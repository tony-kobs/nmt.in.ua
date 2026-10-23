import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";

/** A run older than this means the 10-minute cron has missed two beats. */
export const CRON_OK_WITHIN_MINUTES = 25;

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
  const ageMinutes = Math.max(0, Math.floor((input.now.getTime() - input.ranAtMs) / 60_000));
  return {
    lastRunAt: new Date(input.ranAtMs).toISOString(),
    ageMinutes,
    ok: ageMinutes <= CRON_OK_WITHIN_MINUTES,
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

export async function recordMarathonCronRun(
  counts: CronCounts,
  now = new Date(),
  getConnection?: Conn,
): Promise<void> {
  await withHeartbeat(async (connection) => {
    await connection.execute(
      `INSERT INTO marathon_cron_heartbeat (id, ran_at_ms, processed, sent, failed)
       VALUES (1, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         ran_at_ms = VALUES(ran_at_ms),
         processed = VALUES(processed),
         sent = VALUES(sent),
         failed = VALUES(failed)`,
      [now.getTime(), counts.processed, counts.sent, counts.failed],
    );
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
      ran_at_ms: number | string;
      processed: number | string;
      sent: number | string;
      failed: number | string;
    }>(
      `SELECT ran_at_ms, processed, sent, failed
       FROM marathon_cron_heartbeat
       WHERE id = 1`,
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
      ranAtMs: row ? Number(row.ran_at_ms) : null,
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
