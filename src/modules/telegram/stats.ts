import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";
import { nowUnixSec } from "@/modules/testing/sessionElapsed";
import {
  SESSION_STATUS_COMPLETED,
  SESSION_TYPE_USER,
  sessionPercent,
} from "@/modules/sessions/types";
import { loadTelegramConnection } from "./schema";
import { getKyivWeekInterval } from "./taskDay";
import { cleanTitle, html } from "./ui";

export type TelegramWeekTopic = { name: string; percent: number };
export type TelegramWeekMarathon = { title: string };

export type TelegramStudentStats = {
  weekTopics: TelegramWeekTopic[];
  weekMarathons: TelegramWeekMarathon[];
};

type Deps = {
  getConnection: () => Promise<SqlConnection>;
  nowSec?: () => number;
};

/**
 * Read-only progress for one already-verified app user. The caller resolves the user from the
 * Telegram identity; this function never accepts identifiers from the chat.
 */
export async function getTelegramStudentStats(
  userId: number,
  deps: Deps = { getConnection: loadTelegramConnection },
): Promise<TelegramStudentStats> {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("Invalid stats owner.");
  const connection = await deps.getConnection();
  const week = getKyivWeekInterval((deps.nowSec ?? nowUnixSec)());
  try {
    const topics = await connection.query<{ theme_name: string | null; tasks_number: number; right_number: number }>(
      `SELECT t.name AS theme_name, ts.tasks_number, ts.right_number
       FROM task_sessions ts
       LEFT JOIN themes t ON t.id = ts.theme_id
       WHERE ts.user_id = ? AND ts.session_type = ? AND ts.session_status = ?
         AND ts.start_time >= ? AND ts.start_time < ?
       ORDER BY ts.id DESC
       LIMIT 20`,
      [userId, SESSION_TYPE_USER, SESSION_STATUS_COMPLETED, week.startSec, week.endSec],
    );
    const marathons = await connection.query<{ title: string | null }>(
      `SELECT m.title
       FROM marathon_participants p
       INNER JOIN marathons m ON m.id = p.marathon_id
       WHERE p.user_id = ? AND p.finished_at IS NOT NULL
         AND p.finished_at >= FROM_UNIXTIME(?) AND p.finished_at < FROM_UNIXTIME(?)
       ORDER BY p.finished_at DESC
       LIMIT 10`,
      [userId, week.startSec, week.endSec],
    );
    const seen = new Set<string>();
    const weekTopics: TelegramWeekTopic[] = [];
    for (const row of topics) {
      const name = cleanTitle(row.theme_name, "Тема");
      if (seen.has(name)) continue;
      seen.add(name);
      const score = sessionPercent(Number(row.tasks_number), Number(row.right_number));
      weekTopics.push({ name, percent: score === null ? 0 : Math.round(score) });
    }
    return {
      weekTopics,
      weekMarathons: marathons.map((row) => ({ title: cleanTitle(row.title, "Марафон") })),
    };
  } finally {
    connection.release();
  }
}

export function formatTelegramStudentStats(stats: TelegramStudentStats): string {
  const lines = ["<b>📊 Моя статистика</b>", "", "Цей тиждень, понеділок–неділя за Києвом."];
  if (stats.weekTopics.length === 0 && stats.weekMarathons.length === 0) {
    lines.push("", "Цього тижня ще немає пройдених тем і завершених марафонів.");
    return lines.join("\n");
  }
  lines.push("", "<b>Пройдені теми</b>");
  if (stats.weekTopics.length === 0) lines.push("Ще немає.");
  for (const topic of stats.weekTopics) lines.push(`• ${html(topic.name)} — ${topic.percent}%`);
  lines.push("", "<b>Завершені марафони</b>");
  if (stats.weekMarathons.length === 0) lines.push("Ще немає.");
  for (const marathon of stats.weekMarathons) lines.push(`• ${html(marathon.title)}`);
  return lines.join("\n");
}
