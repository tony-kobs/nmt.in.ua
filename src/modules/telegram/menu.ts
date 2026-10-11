import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";
import { nowUnixSec } from "@/modules/testing/sessionElapsed";
import { getTelegramAccountProfile, type TelegramAccountProfile } from "./account";
import { buildLeaderboardScreen, type LeaderboardDeps } from "./leaderboard";
import {
  formatQuietHours, getNotificationPreferences, isPreferenceToggle, PREFERENCE_TOGGLES, QUIET_HOUR_PRESETS,
  quietPresetIndex, setQuietHours, toggleNotificationPreference, togglesForRole, type PreferenceToggle,
} from "./preferences";
import { loadTelegramConnection } from "./schema";
import { formatTelegramStudentStats, getTelegramStudentStats, type TelegramStudentStats } from "./stats";
import { buildTaskListReply, type TaskListDeps } from "./taskList";
import { formatTeacherSummary, getTeacherAssignmentSummary, teacherSummaryKeyboard } from "./teacher";
import type { InlineKeyboard, TelegramReply } from "./taskInteraction";
import { formatKyivDateTime, html, MENU, navRow, NOT_LINKED_TEXT, screen, siteButton, STALE_TEXT } from "./ui";

export type MenuScreen = "home" | "tasks" | "today" | "stats" | "notif" | "acct" | "help" | "stud" | "lb";
export type MenuAction =
  | { kind: "screen"; screen: MenuScreen }
  | { kind: "toggle"; key: PreferenceToggle }
  | { kind: "quiet" }
  | { kind: "quietSet"; preset: number }
  | { kind: "stale" };
export type MenuRequest = { chatId: string; userId: string; queryId?: string; messageId?: number; action: MenuAction };

export type MenuDeps = TaskListDeps & {
  getProfile?: typeof getTelegramAccountProfile;
  getStats?: (userId: number) => Promise<TelegramStudentStats>;
  /** True when this chat also takes part in a daily marathon; adds the marathon entry to the menu. */
  hasMarathon?: (chatId: string) => Promise<boolean>;
  leaderboard?: Omit<LeaderboardDeps, "getConnection">;
  getConnection?: () => Promise<SqlConnection>;
  nowSec?: () => number;
};

const SCREENS: Record<string, MenuScreen> = {
  home: "home", tasks: "tasks", today: "today", stats: "stats", notif: "notif", acct: "acct", help: "help", stud: "stud", lb: "lb",
};
const COMMANDS: Record<string, MenuScreen> = {
  menu: "home", start: "home", stats: "stats", help: "help", settings: "notif", notifications: "notif", leaderboard: "lb",
};

type Envelope = { id?: unknown; data?: unknown; from?: { id?: number }; message?: { message_id?: unknown; chat?: { id?: number; type?: string } } };

/** Menu buttons (`m:`) and preference buttons (`p:`), private chat only, sender must own the chat. */
export function parseMenuCallback(update: unknown): MenuRequest | null {
  if (!update || typeof update !== "object") return null;
  const q = (update as { callback_query?: Envelope }).callback_query;
  if (!q || typeof q.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(q.id) || typeof q.data !== "string" ||
    !/^[mp]:/.test(q.data) || !q.from || !q.message?.chat || !Number.isSafeInteger(q.from.id) || Number(q.from.id) <= 0 ||
    q.message.chat.type !== "private" || q.message.chat.id !== q.from.id) return null;
  const messageId = Number.isSafeInteger(q.message.message_id) && Number(q.message.message_id) > 0 ? Number(q.message.message_id) : undefined;
  const base = { chatId: String(q.from.id), userId: String(q.from.id), queryId: q.id, ...(messageId ? { messageId } : {}) };
  return { ...base, action: parseMenuData(q.data) };
}

export function parseMenuData(data: string): MenuAction {
  if (data.length > 64) return { kind: "stale" };
  const screenMatch = /^m:([a-z]{2,8})$/.exec(data);
  if (screenMatch && Object.prototype.hasOwnProperty.call(SCREENS, screenMatch[1])) return { kind: "screen", screen: SCREENS[screenMatch[1]] };
  const toggle = /^p:t:([a-z]{2,4})$/.exec(data);
  if (toggle && isPreferenceToggle(toggle[1])) return { kind: "toggle", key: toggle[1] };
  if (data === "p:q") return { kind: "quiet" };
  const quiet = /^p:q:([0-9])$/.exec(data);
  if (quiet && Number(quiet[1]) < QUIET_HOUR_PRESETS.length) return { kind: "quietSet", preset: Number(quiet[1]) };
  return { kind: "stale" };
}

/** `/menu`, bare `/start`, `/stats`, `/help`, `/settings`, `/notifications`, `/leaderboard` in a private chat. */
export function parseMenuCommand(update: unknown): MenuRequest | null {
  if (!update || typeof update !== "object") return null;
  const message = (update as { message?: { chat?: { id?: number; type?: string }; from?: { id?: number }; text?: unknown } }).message;
  if (!message?.chat || !message.from || message.chat.type !== "private" || !Number.isSafeInteger(message.from.id) ||
    Number(message.from.id) <= 0 || message.chat.id !== message.from.id || typeof message.text !== "string") return null;
  const match = /^\/([a-z]+)(?:@\w+)?\s*$/.exec(message.text);
  if (!match || !Object.prototype.hasOwnProperty.call(COMMANDS, match[1])) return null;
  return { chatId: String(message.chat.id), userId: String(message.from.id), action: { kind: "screen", screen: COMMANDS[match[1]] } };
}

const HELP_TEXT = [
  "<b>❓ Допомога</b>",
  "",
  "/menu — головне меню",
  "/tasks — усі актуальні завдання",
  "/today — завдання з терміном сьогодні",
  "/done &lt;посилання&gt; — завершити завдання зі списку",
  "/stats — моя статистика",
  "/settings — налаштування сповіщень",
  "/leaderboard — рейтинг марафону nmt.in.ua (як на сторінці «Рейтинг»)",
  "/top — таблиця місць денного марафону (для його учасників)",
  "",
  "Відповіді на завдання зберігайте в кабінеті на nmt.in.ua, а завершити сесію можна тут кнопкою «✅ Завершити».",
].join("\n");

function homeKeyboard(profile: TelegramAccountProfile, marathon: boolean): InlineKeyboard["inline_keyboard"] {
  const rows: InlineKeyboard["inline_keyboard"] = profile.role === "teacher"
    ? [
        [{ text: "👥 Мої учні", callback_data: MENU.students }, { text: "🏆 Рейтинг", callback_data: MENU.leaderboard }],
        [{ text: "🔔 Сповіщення", callback_data: MENU.notifications }, { text: "👤 Мій акаунт", callback_data: MENU.account }],
        [{ text: "❓ Допомога", callback_data: MENU.help }],
      ]
    : [
        [{ text: "📚 Мої завдання", callback_data: MENU.tasks }, { text: "📅 Сьогодні", callback_data: MENU.today }],
        [{ text: "📊 Моя статистика", callback_data: MENU.stats }, { text: "🔔 Сповіщення", callback_data: MENU.notifications }],
        [{ text: "👤 Мій акаунт", callback_data: MENU.account }, { text: "❓ Допомога", callback_data: MENU.help }],
        [{ text: "🏆 Рейтинг", callback_data: MENU.leaderboard }],
      ];
  // `mh:menu` is the marathon bot's own entry point; the marathon flow stays untouched.
  if (marathon) rows.push([{ text: "🏁 Марафон", callback_data: "mh:menu" }]);
  return rows;
}

function notificationsScreen(chatId: string, profile: TelegramAccountProfile, prefs: Awaited<ReturnType<typeof getNotificationPreferences>>, messageId?: number): TelegramReply {
  if (!prefs) {
    return screen(chatId, "<b>🔔 Сповіщення</b>\n\nНалаштування сповіщень тимчасово недоступні. Спробуйте пізніше.", [navRow()], messageId);
  }
  const keys = togglesForRole(profile.role);
  const lines = ["<b>🔔 Сповіщення</b>", ""];
  for (const key of keys) lines.push(`${prefs[PREFERENCE_TOGGLES[key].field] ? "✅" : "❌"} ${PREFERENCE_TOGGLES[key].label}`);
  lines.push(`🌙 Тихі години: ${formatQuietHours(prefs)}`, "", "Натисніть пункт, щоб увімкнути або вимкнути. Час — київський.");
  const rows: InlineKeyboard["inline_keyboard"] = keys.map((key) => [{
    text: `${prefs[PREFERENCE_TOGGLES[key].field] ? "✅" : "❌"} ${PREFERENCE_TOGGLES[key].label}`,
    callback_data: `p:t:${key}`,
  }]);
  rows.push([{ text: "🌙 Тихі години", callback_data: "p:q" }], navRow());
  return screen(chatId, lines.join("\n"), rows, messageId);
}

function quietScreen(chatId: string, current: number, messageId?: number): TelegramReply {
  const rows: InlineKeyboard["inline_keyboard"] = QUIET_HOUR_PRESETS.map((preset, index) => [{
    text: `${index === current ? "● " : ""}${preset ? formatQuietHours({ quietStart: preset[0], quietEnd: preset[1] }) : "Вимкнути"}`,
    callback_data: `p:q:${index}`,
  }]);
  rows.push(navRow({ data: MENU.notifications }));
  return screen(chatId, "<b>🌙 Тихі години</b>\n\nУ цей час бот не надсилатиме сповіщень; нові завдання прийдуть після завершення тихих годин.", rows, messageId);
}

export async function handleMenuRequest(request: MenuRequest, deps: MenuDeps = {}): Promise<TelegramReply> {
  const { chatId, messageId, action } = request;
  const log = deps.logError ?? ((value: unknown) => console.error("telegram menu failed", value));
  const getConnection = deps.getConnection ?? loadTelegramConnection;
  if (action.kind === "stale") {
    return screen(chatId, STALE_TEXT, [navRow()]);
  }
  const profileResult = await (deps.getProfile ?? getTelegramAccountProfile)(request.userId, { getConnection, logError: log });
  if (profileResult.status === "error") {
    if (profileResult.code === "databaseFailure") return { chatId, text: "Не вдалося відкрити меню. Спробуйте пізніше." };
    const intro = action.kind === "screen" && action.screen === "help" ? `${HELP_TEXT}\n\n` : "";
    return screen(chatId, `${intro}${NOT_LINKED_TEXT}`, [[siteButton("🔗 Підключити в кабінеті", "/account")]]);
  }
  const profile = profileResult.profile;
  const withConnection = async <T>(work: (connection: SqlConnection) => Promise<T>): Promise<T> => {
    const connection = await getConnection();
    try { return await work(connection); } finally { connection.release(); }
  };
  try {
    if (action.kind === "toggle" || action.kind === "quietSet" || action.kind === "quiet") {
      if (action.kind === "toggle" && PREFERENCE_TOGGLES[action.key].role !== profile.role) {
        return screen(chatId, STALE_TEXT, [navRow({ data: MENU.notifications })]);
      }
      return await withConnection(async (connection) => {
        const prefs = await getNotificationPreferences(connection, profile.accountId);
        if (!prefs) return notificationsScreen(chatId, profile, null, messageId);
        if (action.kind === "quiet") return quietScreen(chatId, quietPresetIndex(prefs), messageId);
        if (action.kind === "toggle") await toggleNotificationPreference(connection, profile.accountId, action.key);
        else await setQuietHours(connection, profile.accountId, action.preset);
        return notificationsScreen(chatId, profile, await getNotificationPreferences(connection, profile.accountId), messageId);
      });
    }
    switch (action.screen) {
      case "home": {
        let marathon = false;
        try { marathon = deps.hasMarathon ? await deps.hasMarathon(chatId) : false; } catch (error) { log(error); }
        const greeting = profile.displayName ? `, ${html(profile.displayName)}` : "";
        return screen(chatId, `<b>👋 Вітаємо${greeting}!</b>\n\nОберіть розділ:`, homeKeyboard(profile, marathon), messageId);
      }
      case "tasks":
      case "today":
        return await buildTaskListReply({ chatId, userId: request.userId, today: action.screen === "today", editMessageId: messageId }, deps);
      case "stats": {
        const stats = await (deps.getStats ?? ((userId: number) => getTelegramStudentStats(userId, { getConnection })))(profile.userId);
        return screen(chatId, formatTelegramStudentStats(stats), [[siteButton("🌐 Детальні результати", "/results")], navRow()], messageId);
      }
      case "notif":
        return await withConnection(async (connection) =>
          notificationsScreen(chatId, profile, await getNotificationPreferences(connection, profile.accountId), messageId));
      case "acct": {
        const lines = [
          "<b>👤 Мій акаунт</b>",
          "",
          `Ім’я: ${html(profile.displayName || "—")}`,
          `Роль: ${profile.role === "teacher" ? "Вчитель" : "Учень"}`,
          ...(profile.linkedAt ? [`Telegram підключено: ${formatKyivDateTime(profile.linkedAt)}`] : []),
          "",
          "Змінити дані профілю можна в кабінеті на сайті.",
        ];
        return screen(chatId, lines.join("\n"), [[siteButton("🌐 Кабінет на сайті", "/account")], navRow()], messageId);
      }
      case "help":
        return screen(chatId, HELP_TEXT, [navRow()], messageId);
      case "stud": {
        if (profile.role !== "teacher") return screen(chatId, "Цей розділ доступний лише вчителям.", [navRow()], messageId);
        const now = (deps.nowSec ?? nowUnixSec)();
        const summary = await withConnection((connection) => getTeacherAssignmentSummary(connection, profile.userId, now));
        const keyboard = teacherSummaryKeyboard();
        return screen(chatId, formatTeacherSummary(summary, now, "👥 Мої учні"), keyboard.inline_keyboard, messageId);
      }
      case "lb":
        return await buildLeaderboardScreen(chatId, profile, messageId, { ...deps.leaderboard, getConnection });
    }
  } catch (error) {
    log(error);
    return screen(chatId, "Не вдалося виконати дію. Спробуйте пізніше.", [navRow()]);
  }
}
