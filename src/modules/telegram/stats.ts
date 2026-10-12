import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";
import { getRecentResults } from "@/modules/results/getRecentResults";
import { compareByWorstScore } from "@/modules/results/teacherStudentResults";
import { getScoreLevel } from "@/modules/results/types";
import { getStudentTopicStats } from "@/modules/recommendations/getStudentTopicStats";
import { SESSION_STATUS_COMPLETED } from "@/modules/sessions/types";
import { loadTelegramConnection } from "./schema";
import { cleanTitle, html } from "./ui";

export const STATS_RECENT_LIMIT = 5;
export const STATS_TOPIC_LIMIT = 10;
export const STATS_WEAK_LIMIT = 3;
/** Below the "high" score level of /results — worth another round. */
const WEAK_BELOW_PERCENT = 70;

export type TelegramStudentStats = {
  completedSessions: number;
  averagePercent: number | null;
  recent: { topic: string; score: number }[];
  topics: { name: string; percent: number; lastPercent: number | null }[];
  weakest: { name: string; percent: number }[];
};

type Deps = { getConnection: () => Promise<SqlConnection> };

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
  const borrowed: SqlConnection = { ...connection, release: () => {} };
  const shared = { getConnection: async () => borrowed };
  try {
    const counts = await connection.query<{ completed: number | string }>(
      "SELECT COUNT(*) AS completed FROM task_sessions WHERE user_id = ? AND session_status = ?",
      [userId, SESSION_STATUS_COMPLETED],
    );
    const topicStats = await getStudentTopicStats(userId, shared);
    const recent = await getRecentResults(userId, STATS_RECENT_LIMIT, shared);
    const scored = topicStats.topicScores
      .filter((row) => row.overallPercent !== null)
      .map((row) => ({ name: cleanTitle(row.themeName, "Тема"), percent: row.overallPercent as number, lastPercent: row.lastPercent }));
    const averagePercent = scored.length
      ? scored.reduce((sum, row) => sum + row.percent, 0) / scored.length
      : null;
    const weakest = scored
      .filter((row) => row.percent < WEAK_BELOW_PERCENT)
      .sort((a, b) => compareByWorstScore(a.percent, b.percent))
      .slice(0, STATS_WEAK_LIMIT)
      .map(({ name, percent }) => ({ name, percent }));
    return {
      completedSessions: Number(counts[0]?.completed) || 0,
      averagePercent,
      recent: recent.map((item) => ({ topic: cleanTitle(item.topic, "Тема"), score: item.score })),
      topics: scored.slice(0, STATS_TOPIC_LIMIT),
      weakest,
    };
  } finally {
    connection.release();
  }
}

const levelIcon = { high: "🟢", medium: "🟡", low: "🔴", none: "⚪️" } as const;

function percent(value: number): string {
  return `${Math.round(value)}%`;
}

export function formatTelegramStudentStats(stats: TelegramStudentStats): string {
  if (stats.completedSessions === 0 && stats.recent.length === 0 && stats.topics.length === 0) {
    return "<b>📊 Моя статистика</b>\n\nПоки що немає завершених сесій. Пройдіть першу тему на nmt.in.ua — і тут з’явиться ваш прогрес.";
  }
  const lines = [
    "<b>📊 Моя статистика</b>",
    "",
    `✅ Завершено сесій: <b>${stats.completedSessions}</b>`,
    `📈 Середній результат: <b>${stats.averagePercent === null ? "—" : percent(stats.averagePercent)}</b>`,
  ];
  if (stats.recent.length) {
    lines.push("", "<b>Останні результати</b>");
    for (const item of stats.recent) lines.push(`• ${html(item.topic)} — ${item.score}%`);
  }
  if (stats.topics.length) {
    lines.push("", "<b>Прогрес за темами</b>");
    for (const topic of stats.topics) {
      const last = topic.lastPercent === null ? "" : ` (остання спроба ${percent(topic.lastPercent)})`;
      lines.push(`${levelIcon[getScoreLevel(topic.percent)]} ${html(topic.name)} — ${percent(topic.percent)}${last}`);
    }
  }
  if (stats.weakest.length) {
    lines.push("", "<b>🎯 Варто підтягнути</b>");
    for (const topic of stats.weakest) lines.push(`• ${html(topic.name)} — ${percent(topic.percent)}`);
  }
  return lines.join("\n");
}
