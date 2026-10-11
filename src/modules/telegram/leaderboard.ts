import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";
import { getMarathonLeaderboard, type GetMarathonLeaderboardOptions } from "@/modules/marathons/getMarathonLeaderboard";
import type { MarathonLeaderboardRow, MarathonLeaderboardView } from "@/modules/marathons/types";
import { formatPercent, formatSpeed } from "@/modules/results/types";
import { getTeacherStudents } from "@/modules/teacher-students/getTeacherStudents";
import type { TelegramAccountProfile } from "./account";
import { loadTelegramConnection } from "./schema";
import type { InlineKeyboard, TelegramReply } from "./taskInteraction";
import { cleanTitle, formatKyivDateTime, html, MENU, navRow, screen, siteButton } from "./ui";

/** The leaderboard marathon (`marathons.kind = 'leaderboard'`, web `/leaderboard`); `/top` stays with the daily marathon bot. */
export const LEADERBOARD_TOP = 10;
/** Telegram messages are capped at 4096 characters; long rosters are cut with a "та ще N" line. */
export const LEADERBOARD_ROSTER_LIMIT = 30;

export type LeaderboardDeps = {
  getLeaderboard?: (viewerUserId: number, options: GetMarathonLeaderboardOptions) => Promise<MarathonLeaderboardView | null>;
  /** Only the student ids are used; names come from the leaderboard rows the web page also shows. */
  getRosterStudentIds?: (teacherUserId: number) => Promise<number[]>;
  getConnection?: () => Promise<SqlConnection>;
};

const TITLE = "<b>🏆 Рейтинг марафону</b>";
const MEDALS = ["🥇", "🥈", "🥉"];

function rankLabel(rank: number): string {
  return MEDALS[rank - 1] ?? `${rank}.`;
}

function rowLine(row: MarathonLeaderboardRow, self: boolean): string {
  const name = html(cleanTitle(row.displayName, "Учасник").slice(0, 60));
  const metrics = row.sessionsCount > 0
    ? `${formatPercent(row.avgPercent)} · ${formatSpeed(row.avgSecPerTask)} с/завд. · сесій: ${row.sessionsCount}`
    : "ще немає зарахованих сесій";
  return `${rankLabel(row.rank)} ${self ? "<b>" : ""}${name}${self ? " (ви)</b>" : ""} — ${metrics}`;
}

function header(view: MarathonLeaderboardView): string[] {
  return [
    TITLE,
    "",
    `<b>${html(cleanTitle(view.marathon.title, "Марафон"))}</b>`,
    `Триває до ${formatKyivDateTime(Number(view.marathon.ends_at))} (Київ)`,
    `Зараховуються сесії від ${Number(view.marathon.min_tasks_per_session)} завдань.`,
  ];
}

function keyboard(): InlineKeyboard["inline_keyboard"] {
  return [
    [siteButton("🌐 Рейтинг на сайті", "/leaderboard")],
    [{ text: "🔄 Оновити", callback_data: MENU.leaderboard }],
    navRow({ data: MENU.home }),
  ];
}

const NO_MARATHON = [TITLE, "", "Зараз немає активного марафону з рейтингом. Стежте за оголошеннями на nmt.in.ua."].join("\n");

export function formatStudentLeaderboard(view: MarathonLeaderboardView | null): string {
  if (!view) return NO_MARATHON;
  const lines = header(view);
  lines.push(`Учасників: ${view.participantCount}`, "");
  const self = view.rows.find((row) => row.isCurrentUser);
  if (view.isParticipant && self) {
    lines.push(`📍 Ваше місце: <b>${self.rank}</b> з ${view.participantCount}`, "");
  } else {
    lines.push("Ви ще не берете участі в цьому марафоні. Приєднатися можна на сторінці рейтингу на сайті.", "");
  }
  if (view.rows.length === 0) {
    lines.push("Поки що ніхто не приєднався.");
    return lines.join("\n");
  }
  lines.push(`<b>Топ-${Math.min(LEADERBOARD_TOP, view.rows.length)}</b>`);
  const top = view.rows.slice(0, LEADERBOARD_TOP);
  for (const row of top) lines.push(rowLine(row, row.isCurrentUser));
  if (self && self.rank > LEADERBOARD_TOP) lines.push("…", rowLine(self, true));
  return lines.join("\n");
}

/** Teacher view lists only roster students (the teacher's verified `teacher_students` links); other participants are counted, never named. */
export function formatTeacherLeaderboard(view: MarathonLeaderboardView | null, rosterSize: number): string {
  if (!view) return NO_MARATHON;
  const lines = header(view);
  lines.push(`Усього учасників: ${view.participantCount}`);
  if (rosterSize === 0) {
    lines.push("", "У вас ще немає прив’язаних учнів. Додайте їх у кабінеті на сайті.");
    return lines.join("\n");
  }
  lines.push(`Ваших учнів у марафоні: <b>${view.rosterParticipantCount}</b> з ${rosterSize}`, "");
  const roster = view.rows.filter((row) => row.isRosterStudent);
  if (roster.length === 0) {
    lines.push("Ніхто з ваших учнів ще не приєднався.");
    return lines.join("\n");
  }
  for (const row of roster.slice(0, LEADERBOARD_ROSTER_LIMIT)) lines.push(rowLine(row, false));
  if (roster.length > LEADERBOARD_ROSTER_LIMIT) lines.push(`…та ще ${roster.length - LEADERBOARD_ROSTER_LIMIT} — на сайті.`);
  const active = roster.filter((row) => row.sessionsCount > 0).length;
  lines.push("", `З зарахованими сесіями: ${active} з ${roster.length}`);
  return lines.join("\n");
}

/**
 * One `getMarathonLeaderboard` call per screen: it already resolves the active marathon, so no separate
 * `getActiveMarathon` read runs (that would repeat `closeExpiredMarathons`' idempotent archive UPDATE).
 */
export async function buildLeaderboardScreen(
  chatId: string,
  profile: TelegramAccountProfile,
  messageId: number | undefined,
  deps: LeaderboardDeps = {},
): Promise<TelegramReply> {
  const getConnection = deps.getConnection ?? loadTelegramConnection;
  const getLeaderboard = deps.getLeaderboard
    ?? ((viewerUserId: number, options: GetMarathonLeaderboardOptions) => getMarathonLeaderboard(viewerUserId, options, getConnection));
  if (profile.role === "teacher") {
    const ids = await (deps.getRosterStudentIds
      ?? (async (teacherUserId: number) => (await getTeacherStudents(teacherUserId)).map((row) => row.studentUserId)))(profile.userId);
    const rosterStudentIds = new Set(ids);
    const view = await getLeaderboard(profile.userId, { rosterStudentIds });
    return screen(chatId, formatTeacherLeaderboard(view, rosterStudentIds.size), keyboard(), messageId);
  }
  const view = await getLeaderboard(profile.userId, {});
  return screen(chatId, formatStudentLeaderboard(view), keyboard(), messageId);
}
