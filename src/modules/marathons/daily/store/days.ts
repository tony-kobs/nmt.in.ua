import "server-only";

import { withConn, type Conn } from "./db";
import type { MarathonDay } from "./types";

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

export async function deleteDay(
  marathonId: number,
  dayId: number,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `DELETE FROM marathon_day_tasks WHERE day_id = ?`,
      [dayId],
    );
    await connection.execute(
      `DELETE FROM marathon_day_materials WHERE day_id = ?`,
      [dayId],
    );
    await connection.execute(
      `DELETE FROM marathon_day_progress WHERE day_id = ?`,
      [dayId],
    );
    await connection.execute(
      `DELETE FROM marathon_days WHERE id = ? AND marathon_id = ?`,
      [dayId, marathonId],
    );
  }, getConnection);
}
