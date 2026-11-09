import "server-only";

import { flag, withConn, type Conn } from "./db";
import type { ParticipantReport } from "./types";

export async function listParticipantReports(
  marathonId: number,
  getConnection?: Conn,
): Promise<ParticipantReport[]> {
  return withConn(async (connection) => {
    const rows = await connection.query<{
      user_id: number;
      display_name: string;
      login: string;
      email: string | null;
      email_verified_at: unknown;
      source: string | null;
      streak: number;
      finished_at: unknown;
      converted_at: unknown;
      day_number: number | null;
      score: number | null;
      passed: number | null;
      completed_at: unknown;
    }>(
      `SELECT u.id AS user_id, u.display_name, u.login, u.email, u.email_verified_at,
              p.source, p.streak, p.finished_at, p.converted_at,
              d.day_number, pr.score, pr.passed, pr.completed_at
       FROM marathon_participants p
       INNER JOIN app_users u ON u.id = p.user_id
       LEFT JOIN marathon_days d ON d.marathon_id = p.marathon_id
       LEFT JOIN marathon_day_progress pr
         ON pr.marathon_id = p.marathon_id AND pr.user_id = p.user_id AND pr.day_id = d.id
       WHERE p.marathon_id = ?
       ORDER BY u.display_name, d.day_number`,
      [marathonId],
    );
    const byUser = new Map<number, ParticipantReport>();
    for (const row of rows) {
      let report = byUser.get(row.user_id);
      if (!report) {
        report = {
          userId: row.user_id,
          displayName: row.display_name,
          login: row.login,
          email: row.email,
          emailVerified: Boolean(row.email_verified_at),
          source: row.source,
          streak: Number(row.streak) || 0,
          finished: Boolean(row.finished_at),
          converted: Boolean(row.converted_at),
          days: [],
        };
        byUser.set(row.user_id, report);
      }
      if (row.day_number != null) {
        report.days.push({
          dayNumber: row.day_number,
          score: row.score == null ? null : Number(row.score),
          passed: flag(row.passed),
          completed: Boolean(row.completed_at),
        });
      }
    }
    return [...byUser.values()];
  }, getConnection);
}
