import "server-only";

import { normalizeInviteAudience } from "../invite";
import { deleteOrphanTaggedRiddles } from "../riddleStore";
import { invalidateMarathonHomeCache } from "./cache";
import { MARATHON_SELECT, mapMarathon, withConn, type Conn } from "./db";
import { finishElapsedOn } from "./lifecycle";
import type { DailyMarathon, DailyStatus } from "./types";

export async function listDailyMarathons(getConnection?: Conn): Promise<DailyMarathon[]> {
  return withConn(async (connection) => {
    await finishElapsedOn(connection, new Date());
    const rows = await connection.query<Parameters<typeof mapMarathon>[0]>(
      `SELECT ${MARATHON_SELECT} FROM marathons WHERE kind = 'daily' ORDER BY id DESC`,
      [],
    );
    return rows.flatMap((row) => {
      const marathon = mapMarathon(row);
      return marathon ? [marathon] : [];
    });
  }, getConnection);
}

async function readDailyBySlug(
  slug: string,
  requireStart: boolean,
  getConnection?: Conn,
): Promise<DailyMarathon | null> {
  return withConn(async (connection) => {
    await finishElapsedOn(connection, new Date());
    const rows = await connection.query<Parameters<typeof mapMarathon>[0]>(
      `SELECT ${MARATHON_SELECT} FROM marathons WHERE slug = ? AND kind = 'daily' LIMIT 1`,
      [slug],
    );
    return rows[0] ? mapMarathon(rows[0], { requireStart }) : null;
  }, getConnection);
}

export async function getDailyBySlug(
  slug: string,
  getConnection?: Conn,
): Promise<DailyMarathon | null> {
  return readDailyBySlug(slug, true, getConnection);
}

/** Public page lookup. A row with no readable start date still comes back. */
export async function getPublicDailyBySlug(
  slug: string,
  getConnection?: Conn,
): Promise<DailyMarathon | null> {
  return readDailyBySlug(slug, false, getConnection);
}

export async function getDailyById(
  id: number,
  getConnection?: Conn,
): Promise<DailyMarathon | null> {
  return withConn(async (connection) => {
    await finishElapsedOn(connection, new Date());
    const rows = await connection.query<Parameters<typeof mapMarathon>[0]>(
      `SELECT ${MARATHON_SELECT} FROM marathons WHERE id = ? AND kind = 'daily' LIMIT 1`,
      [id],
    );
    return rows[0] ? mapMarathon(rows[0]) : null;
  }, getConnection);
}

export async function insertDailyMarathon(
  input: Omit<DailyMarathon, "id" | "status"> & { startsAt: number; endsAt: number },
  getConnection?: Conn,
): Promise<number> {
  const id = await withConn(async (connection) => {
    const result = await connection.execute(
      `INSERT INTO marathons
        (slug, title, description, status, starts_at, ends_at, min_tasks_per_session,
         kind, subject, start_date, unlock_hour, reminder_hour, nudge_from, nudge_until,
         days_count, pass_threshold, final_cta_text, final_cta_url, intro_video_url,
         invite_audience, landing_riddle_count, public_chat_url)
       VALUES (?, ?, ?, 'draft', ?, ?, 5, 'daily', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.slug,
        input.title,
        input.description.trim(),
        input.startsAt,
        input.endsAt,
        input.subject,
        input.startDate,
        input.unlockHour,
        input.reminderHour || "19:00",
        input.nudgeFrom ?? 10,
        input.nudgeUntil ?? 21,
        input.daysCount,
        input.passThreshold,
        input.finalCtaText,
        input.finalCtaUrl,
        input.introVideoUrl || null,
        normalizeInviteAudience(input.inviteAudience),
        input.landingRiddleCount,
        input.publicChatUrl.trim() || null,
      ],
    );
    return result.insertId;
  }, getConnection);
  invalidateMarathonHomeCache();
  return id;
}

export async function updateDailyMarathon(
  id: number,
  input: Omit<DailyMarathon, "id" | "status"> & { startsAt: number; endsAt: number },
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `UPDATE marathons
       SET slug = ?, title = ?, description = ?, subject = ?, start_date = ?, unlock_hour = ?,
           reminder_hour = ?, nudge_from = ?, nudge_until = ?,
           days_count = ?, pass_threshold = ?, final_cta_text = ?, final_cta_url = ?,
           intro_video_url = ?, invite_audience = ?, landing_riddle_count = ?, public_chat_url = ?,
           starts_at = ?, ends_at = ?
       WHERE id = ? AND kind = 'daily'`,
      [
        input.slug,
        input.title,
        input.description.trim(),
        input.subject,
        input.startDate,
        input.unlockHour,
        input.reminderHour || "19:00",
        input.nudgeFrom ?? 10,
        input.nudgeUntil ?? 21,
        input.daysCount,
        input.passThreshold,
        input.finalCtaText,
        input.finalCtaUrl,
        input.introVideoUrl || null,
        normalizeInviteAudience(input.inviteAudience),
        input.landingRiddleCount,
        input.publicChatUrl.trim() || null,
        input.startsAt,
        input.endsAt,
        id,
      ],
    );
  }, getConnection);
  invalidateMarathonHomeCache();
}

export async function setDailyStatus(
  id: number,
  status: DailyStatus,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `UPDATE marathons SET status = ? WHERE id = ? AND kind = 'daily'`,
      [status, id],
    );
  }, getConnection);
  invalidateMarathonHomeCache();
}

export async function deleteDailyMarathon(id: number, getConnection?: Conn): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `DELETE t FROM marathon_day_tasks t
       INNER JOIN marathon_days d ON d.id = t.day_id
       WHERE d.marathon_id = ?`,
      [id],
    );
    await connection.execute(
      `DELETE m FROM marathon_day_materials m
       INNER JOIN marathon_days d ON d.id = m.day_id
       WHERE d.marathon_id = ?`,
      [id],
    );
    await connection.execute(
      `DELETE pr FROM marathon_day_progress pr
       INNER JOIN marathon_days d ON d.id = pr.day_id
       WHERE d.marathon_id = ?`,
      [id],
    );
    await connection.execute(`DELETE FROM marathon_days WHERE marathon_id = ?`, [id]);
    await connection.execute(`DELETE FROM marathon_riddles WHERE marathon_id = ?`, [id]);
    await connection.execute(`DELETE FROM riddle_marathon_tags WHERE marathon_id = ?`, [id]);
    await connection.execute(`DELETE FROM marathon_notifications WHERE marathon_id = ?`, [id]);
    await connection.execute(`DELETE FROM marathon_bot_links WHERE marathon_id = ?`, [id]);
    await connection.execute(`DELETE FROM marathon_participants WHERE marathon_id = ?`, [id]);
    await connection.execute(`DELETE FROM marathon_invite_recipients WHERE marathon_id = ?`, [id]);
    await connection.execute(`DELETE FROM marathon_invite_dispatches WHERE marathon_id = ?`, [id]);
    await connection.execute(`DELETE FROM marathons WHERE id = ? AND kind = 'daily'`, [id]);
    await deleteOrphanTaggedRiddles(connection);
  }, getConnection);
  invalidateMarathonHomeCache();
}
