import "server-only";

import { DAY_HAS_ANSWERS_SQL, planDayRemoval } from "../dayRemoval";
import { withConn, type Conn } from "./db";
import type { MarathonDay } from "./types";

export type DeleteDayResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "submissions"; submissions: number };

const SCHEDULE_TABLES = [
  "marathon_notifications",
  "marathon_message_overrides",
  "marathon_message_jobs",
] as const;

export async function listDayTaskCounts(
  marathonId: number,
  getConnection?: Conn,
): Promise<Array<{ dayNumber: number; taskCount: number }>> {
  return withConn(async (connection) => {
    const rows = await connection.query<{ day_number: number; task_count: number }>(
      `SELECT d.day_number, COUNT(t.id) AS task_count
       FROM marathon_days d
       LEFT JOIN marathon_day_tasks t ON t.day_id = d.id
       WHERE d.marathon_id = ?
       GROUP BY d.id, d.day_number
       ORDER BY d.day_number`,
      [marathonId],
    );
    return rows.map((row) => ({
      dayNumber: Number(row.day_number),
      taskCount: Number(row.task_count),
    }));
  }, getConnection);
}

export async function listContentDayNumbers(
  marathonId: number,
  getConnection?: Conn,
): Promise<number[]> {
  const counts = await listDayTaskCounts(marathonId, getConnection);
  return counts.filter((day) => day.taskCount > 0).map((day) => day.dayNumber);
}

export async function listDays(marathonId: number, getConnection?: Conn): Promise<MarathonDay[]> {
  return withConn(async (connection) => {
    const rows = await connection.query<{
      id: number;
      day_number: number;
      topic: string;
      intro_text: string | null;
      image_token: Buffer | Uint8Array | null;
    }>(
      `SELECT d.id, d.day_number, d.topic, d.intro_text, img.token AS image_token
       FROM marathon_days d
       LEFT JOIN marathon_images img
         ON img.marathon_id = d.marathon_id AND img.day_id = d.id
       WHERE d.marathon_id = ?
       ORDER BY d.day_number`,
      [marathonId],
    );
    return rows.map((row) => {
      const token = row.image_token instanceof Uint8Array
        ? Buffer.from(row.image_token).toString("hex")
        : "";
      const imageUrl = /^[a-f0-9]{32}$/.test(token) ? `/api/marathon-media/${token}` : null;
      return {
        id: row.id,
        dayNumber: row.day_number,
        topic: row.topic,
        introText: row.intro_text,
        imageUrl,
      };
    });
  }, getConnection);
}

export async function insertDay(
  marathonId: number,
  input: Omit<MarathonDay, "id">,
  getConnection?: Conn,
): Promise<number> {
  return withConn(async (connection) => {
    const result = await connection.execute(
      `INSERT INTO marathon_days (marathon_id, day_number, topic, intro_text)
       VALUES (?, ?, ?, ?)`,
      [marathonId, input.dayNumber, input.topic, input.introText],
    );
    return result.insertId;
  }, getConnection);
}

export async function updateDay(
  marathonId: number,
  dayId: number,
  input: { topic: string; introText: string },
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `UPDATE marathon_days SET topic = ?, intro_text = ?
       WHERE id = ? AND marathon_id = ?`,
      [input.topic, input.introText, dayId, marathonId],
    );
  }, getConnection);
}

export async function dayAnswerCount(dayId: number, getConnection?: Conn): Promise<number> {
  return withConn(async (connection) => {
    const rows = await connection.query<{ n: number | string }>(
      `SELECT COUNT(*) AS n FROM marathon_day_progress
       WHERE day_id = ? AND ${DAY_HAS_ANSWERS_SQL}`,
      [dayId],
    );
    return Number(rows[0]?.n ?? 0);
  }, getConnection);
}

export async function listDaySubmissionCounts(
  marathonId: number,
  getConnection?: Conn,
): Promise<Map<number, number>> {
  return withConn(async (connection) => {
    const rows = await connection.query<{ day_id: number; n: number | string }>(
      `SELECT day_id, COUNT(*) AS n
       FROM marathon_day_progress
       WHERE marathon_id = ? AND ${DAY_HAS_ANSWERS_SQL}
       GROUP BY day_id`,
      [marathonId],
    );
    return new Map(rows.map((row) => [Number(row.day_id), Number(row.n) || 0]));
  }, getConnection);
}

/**
 * Deletes a day that has no student answers, then renumbers the remaining days
 * from 1 in their previous order and moves schedule rows with those days.
 * A day that already has answers is left untouched.
 */
export async function deleteDay(
  marathonId: number,
  dayId: number,
  getConnection?: Conn,
): Promise<DeleteDayResult> {
  return withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const current = await connection.query<{ day_number: number }>(
        `SELECT day_number FROM marathon_days WHERE id = ? AND marathon_id = ? LIMIT 1`,
        [dayId, marathonId],
      );
      const removed = Number(current[0]?.day_number);
      if (!current[0] || !Number.isInteger(removed)) {
        await connection.rollback();
        return { ok: false, reason: "missing", submissions: 0 };
      }
      const answered = await connection.query<{ n: number | string }>(
        `SELECT COUNT(*) AS n FROM marathon_day_progress
         WHERE day_id = ? AND marathon_id = ? AND ${DAY_HAS_ANSWERS_SQL}`,
        [dayId, marathonId],
      );
      const submissions = Number(answered[0]?.n ?? 0);
      if (submissions > 0) {
        await connection.rollback();
        return { ok: false, reason: "submissions", submissions };
      }
      const siblings = await connection.query<{ day_number: number }>(
        `SELECT day_number FROM marathon_days WHERE marathon_id = ? ORDER BY day_number`,
        [marathonId],
      );
      const moves = planDayRemoval(
        siblings.map((row) => Number(row.day_number)),
        removed,
      );
      await connection.execute(
        `DELETE FROM marathon_images WHERE marathon_id = ? AND day_id = ?`,
        [marathonId, dayId],
      );
      await connection.execute(`DELETE FROM marathon_day_tasks WHERE day_id = ?`, [dayId]);
      await connection.execute(`DELETE FROM marathon_day_materials WHERE day_id = ?`, [dayId]);
      await connection.execute(`DELETE FROM marathon_day_progress WHERE day_id = ?`, [dayId]);
      await connection.execute(
        `DELETE FROM marathon_days WHERE id = ? AND marathon_id = ?`,
        [dayId, marathonId],
      );
      if (moves.length > 0) {
        await connection.execute(
          `UPDATE marathon_days SET day_number = day_number + 100
           WHERE marathon_id = ? AND day_number BETWEEN 1 AND 40`,
          [marathonId],
        );
        for (const move of moves) {
          await connection.execute(
            `UPDATE marathon_days SET day_number = ? WHERE marathon_id = ? AND day_number = ?`,
            [move.to, marathonId, move.from + 100],
          );
        }
      }
      for (const table of SCHEDULE_TABLES) {
        await connection.execute(
          `DELETE FROM ${table} WHERE marathon_id = ? AND day_number = ?`,
          [marathonId, removed],
        );
        await connection.execute(
          `UPDATE ${table} SET day_number = day_number + 100
           WHERE marathon_id = ? AND day_number BETWEEN 1 AND 40`,
          [marathonId],
        );
        for (const move of moves) {
          await connection.execute(
            `UPDATE ${table} SET day_number = ? WHERE marathon_id = ? AND day_number = ?`,
            [move.to, marathonId, move.from + 100],
          );
        }
        await connection.execute(
          `DELETE FROM ${table} WHERE marathon_id = ? AND day_number >= 100`,
          [marathonId],
        );
      }
      await connection.execute(
        `UPDATE marathons SET days_count = GREATEST(1, days_count - 1) WHERE id = ? AND kind = 'daily'`,
        [marathonId],
      );
      await connection.commit();
      return { ok: true };
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }, getConnection);
}
