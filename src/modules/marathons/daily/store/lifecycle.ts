import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { shouldFinishDailyMarathon } from "../lifecycle";
import { isoDate, withConn, type Conn } from "./db";

/**
 * Active daily courses past the scheduled close become finished.
 * Missing day rows do not keep the course active: the clock is start + days_count.
 * A day that was stored as passed with no tasks is unmarked. Both writes are idempotent.
 */
export async function finishElapsedOn(connection: SqlConnection, now: Date): Promise<number> {
  const rows = await connection.query<{
    id: number;
    start_date: unknown;
    unlock_hour: string;
    days_count: number;
  }>(
    `SELECT id, start_date, unlock_hour, days_count
     FROM marathons
     WHERE kind = 'daily' AND status = 'active'`,
    [],
  );
  let finished = 0;
  for (const row of rows) {
    const startDate = isoDate(row.start_date);
    if (!startDate) continue;
    if (!shouldFinishDailyMarathon(now, {
      startDate,
      unlockHour: String(row.unlock_hour).slice(0, 5),
      daysCount: Number(row.days_count),
    })) continue;
    const result = await connection.execute(
      `UPDATE marathons SET status = 'finished'
       WHERE id = ? AND status = 'active' AND kind = 'daily'`,
      [row.id],
    );
    finished += result.affectedRows;
  }
  await connection.execute(
    `UPDATE marathon_day_progress pr
     INNER JOIN marathon_days d ON d.id = pr.day_id
     LEFT JOIN marathon_day_tasks t ON t.day_id = d.id
     SET pr.score = 0, pr.passed = 0
     WHERE t.id IS NULL AND pr.passed <> 0`,
    [],
  );
  return finished;
}

export async function finishElapsedDailyMarathons(
  now: Date,
  getConnection?: Conn,
): Promise<number> {
  return withConn((connection) => finishElapsedOn(connection, now), getConnection);
}
