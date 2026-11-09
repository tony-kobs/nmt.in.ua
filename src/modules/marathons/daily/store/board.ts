import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import {
  applyRankSnapshot,
  publicLeaderName,
  rankParticipants,
  type BoardLine,
  type RankInput,
} from "../leaderboard";
import { parseStoredAnswers } from "../playTasks";
import { asMs, standingTime, withConn, type Conn } from "./db";

export async function loadMarathonBoard(
  marathonId: number,
  getConnection?: Conn,
): Promise<BoardLine[]> {
  return withConn(
    (connection) => composeBoard(connection, marathonId, false),
    getConnection,
  );
}

export async function composeBoard(
  connection: SqlConnection,
  marathonId: number,
  write: boolean,
): Promise<BoardLine[]> {
  await backfillCorrectCounts(connection, marathonId);
  const standings = await readStandings(connection, marathonId);
  const previous = await readPrevPlaces(connection, marathonId);
  const ranked = applyRankSnapshot(previous, rankParticipants(standings));
  if (write) await saveRanks(connection, marathonId, ranked);
  return ranked.map((row) => ({
    userId: row.userId,
    place: row.place,
    prevPlace: row.prevPlace,
    points: row.points,
    totalTimeSec: row.totalTimeSec,
    streak: row.streak,
    name: publicLeaderName(row.displayName),
  }));
}

/** Fill missing correct_count so the public board matches Telegram /top. */
export async function refreshDailyPoints(
  connection: SqlConnection,
  marathonId: number,
): Promise<void> {
  await backfillCorrectCounts(connection, marathonId);
}

async function backfillCorrectCounts(
  connection: SqlConnection,
  marathonId: number,
): Promise<void> {
  const missing = await connection.query<{
    user_id: number;
    day_id: number;
    answers_json: string | null;
  }>(
    `SELECT user_id, day_id, answers_json
     FROM marathon_day_progress
     WHERE marathon_id = ? AND completed_at IS NOT NULL AND correct_count IS NULL`,
    [marathonId],
  );
  if (missing.length === 0) return;
  const keys = await connection.query<{
    day_id: number;
    id: number;
    inline_correct: number | null;
    right_answer_n: number | null;
  }>(
    `SELECT t.day_id, t.id, t.inline_correct, q.right_answer_n
     FROM marathon_day_tasks t
     INNER JOIN marathon_days d ON d.id = t.day_id
     LEFT JOIN quiz_tasks q ON q.id = t.question_id
     WHERE d.marathon_id = ?`,
    [marathonId],
  );
  const byDay = new Map<number, Array<{ id: number; correct: number }>>();
  for (const key of keys) {
    const list = byDay.get(key.day_id) ?? [];
    list.push({
      id: key.id,
      correct: Number(key.inline_correct ?? key.right_answer_n ?? 0) || 0,
    });
    byDay.set(key.day_id, list);
  }
  for (const row of missing) {
    const answers = parseStoredAnswers(row.answers_json);
    let correct = 0;
    for (const task of byDay.get(row.day_id) ?? []) {
      if (answers[task.id] === task.correct) correct += 1;
    }
    await connection.execute(
      `UPDATE marathon_day_progress
       SET correct_count = ?
       WHERE marathon_id = ? AND user_id = ? AND day_id = ? AND correct_count IS NULL`,
      [correct, marathonId, row.user_id, row.day_id],
    );
  }
}

async function readStandings(
  connection: SqlConnection,
  marathonId: number,
): Promise<RankInput[]> {
  const rows = await connection.query<{
    user_id: number;
    display_name: string | null;
    streak: number;
    joined_at: unknown;
    points: number | string | null;
    last_completed: unknown;
    done_days: number | string | null;
    timed_days: number | string | null;
    time_sum: number | string | null;
  }>(
    `SELECT p.user_id AS user_id,
            u.display_name AS display_name,
            p.streak AS streak,
            p.joined_at AS joined_at,
            COALESCE(SUM(CASE WHEN pr.completed_at IS NOT NULL THEN pr.correct_count ELSE 0 END), 0) AS points,
            MAX(CASE WHEN pr.completed_at IS NOT NULL THEN pr.completed_at ELSE NULL END) AS last_completed,
            COALESCE(SUM(CASE WHEN pr.completed_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS done_days,
            COALESCE(SUM(CASE WHEN pr.completed_at IS NOT NULL AND pr.duration_seconds IS NOT NULL THEN 1 ELSE 0 END), 0) AS timed_days,
            COALESCE(SUM(CASE WHEN pr.completed_at IS NOT NULL AND pr.duration_seconds IS NOT NULL THEN pr.duration_seconds ELSE 0 END), 0) AS time_sum
     FROM marathon_participants p
     INNER JOIN app_users u ON u.id = p.user_id
     LEFT JOIN marathon_day_progress pr
       ON pr.marathon_id = p.marathon_id AND pr.user_id = p.user_id
     WHERE p.marathon_id = ? AND u.is_banned = 0 AND u.deletion_due_at IS NULL
     GROUP BY p.user_id, u.display_name, p.streak, p.joined_at`,
    [marathonId],
  );
  return rows.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name?.trim() || "",
    points: Number(row.points) || 0,
    lastCompletedAt: asMs(row.last_completed),
    totalTimeSec: standingTime(row.done_days, row.timed_days, row.time_sum),
    streak: Number(row.streak) || 0,
    joinedAt: asMs(row.joined_at) ?? 0,
  }));
}

async function readPrevPlaces(
  connection: SqlConnection,
  marathonId: number,
): Promise<Map<number, number>> {
  const rows = await connection.query<{ user_id: number; place: number }>(
    `SELECT user_id, place FROM marathon_ranks WHERE marathon_id = ?`,
    [marathonId],
  );
  return new Map(rows.map((row) => [row.user_id, Number(row.place)]));
}

async function saveRanks(
  connection: SqlConnection,
  marathonId: number,
  ranked: Array<{ userId: number; place: number; prevPlace: number | null; points: number }>,
): Promise<void> {
  const now = new Date();
  for (const row of ranked) {
    await connection.execute(
      `INSERT INTO marathon_ranks (marathon_id, user_id, place, prev_place, points, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         place = VALUES(place),
         prev_place = VALUES(prev_place),
         points = VALUES(points),
         updated_at = VALUES(updated_at)`,
      [marathonId, row.userId, row.place, row.prevPlace, row.points, now],
    );
  }
  if (ranked.length === 0) {
    await connection.execute(`DELETE FROM marathon_ranks WHERE marathon_id = ?`, [marathonId]);
    return;
  }
  const ids = ranked.map((row) => row.userId);
  await connection.execute(
    `DELETE FROM marathon_ranks
     WHERE marathon_id = ? AND user_id NOT IN (${ids.map(() => "?").join(",")})`,
    [marathonId, ...ids],
  );
}
