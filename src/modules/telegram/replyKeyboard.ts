import type { InlineKeyboard, ReplyKeyboardMarkup, TelegramReply } from "./taskInteraction";
import { MAIN_MENU_LABEL, MENU } from "./ui";

type MenuButton = { text: string; callbackData: string };

/** Cabinet main menu. The same labels are used by the inline menu and the bottom keyboard. */
export const ACCOUNT_MENU = {
  tasks: { text: "📚 Мої завдання", callbackData: MENU.tasks },
  today: { text: "📅 Сьогодні", callbackData: MENU.today },
  stats: { text: "📊 Моя статистика", callbackData: MENU.stats },
  notifications: { text: "🔔 Сповіщення", callbackData: MENU.notifications },
  account: { text: "👤 Мій акаунт", callbackData: MENU.account },
  help: { text: "❓ Допомога", callbackData: MENU.help },
  students: { text: "👥 Мої учні", callbackData: MENU.students },
  leaderboard: { text: "🏆 Рейтинг", callbackData: MENU.leaderboard },
  marathon: { text: "🏁 Марафон", callbackData: "mh:menu" },
  home: { text: MAIN_MENU_LABEL, callbackData: MENU.home },
} as const satisfies Record<string, MenuButton>;

export type AccountMenuRole = "student" | "teacher";

export function accountMenuRows(role: AccountMenuRole, marathon: boolean, includeHome: boolean): MenuButton[][] {
  const button = ACCOUNT_MENU;
  const rows: MenuButton[][] = role === "teacher"
    ? [
        [button.students, ...(marathon ? [button.leaderboard] : [])],
        [button.notifications, button.account],
        [button.help],
      ]
    : [
        [button.tasks, button.today],
        [button.stats, button.notifications],
        [button.account, button.help],
        ...(marathon ? [[button.leaderboard]] : []),
      ];
  if (marathon) rows.push([button.marathon]);
  if (includeHome) rows.push([button.home]);
  return rows;
}

export function toReplyKeyboard(rows: { text: string }[][]): ReplyKeyboardMarkup {
  return {
    keyboard: rows.map((row) => row.map((button) => ({ text: button.text }))),
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function accountReplyKeyboard(role: AccountMenuRole, marathon: boolean): ReplyKeyboardMarkup {
  return toReplyKeyboard(accountMenuRows(role, marathon, true));
}

export function accountInlineKeyboard(role: AccountMenuRole, marathon: boolean): InlineKeyboard["inline_keyboard"] {
  return accountMenuRows(role, marathon, false).map((row) => row.map((button) => ({
    text: button.text,
    callback_data: button.callbackData,
  })));
}

/** Bottom-keyboard presses send the label as a message. Any known label maps to its callback. */
export function accountCallbackFromText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  for (const button of Object.values(ACCOUNT_MENU)) {
    if (button.text === trimmed) return button.callbackData;
  }
  return null;
}

export function parsePrivateMenuText(update: unknown): { chatId: string; userId: string; text: string } | null {
  if (!update || typeof update !== "object") return null;
  const message = (update as { message?: { chat?: { id?: number; type?: string }; from?: { id?: number }; text?: unknown } }).message;
  if (!message?.chat || !message.from || message.chat.type !== "private" || !Number.isSafeInteger(message.from.id) ||
    Number(message.from.id) <= 0 || message.chat.id !== message.from.id || typeof message.text !== "string") return null;
  const text = message.text.trim();
  if (!text || text.startsWith("/") || text.length > 64) return null;
  return { chatId: String(message.chat.id), userId: String(message.from.id), text };
}

/** Put the bottom menu on a plain text message when possible, otherwise on the first text message. */
export function attachReplyKeyboard(reply: TelegramReply, keyboard: ReplyKeyboardMarkup): TelegramReply {
  const { continuation, ...head } = reply;
  const list = [head, ...(continuation ?? [])];
  const plain = (item: TelegramReply) => item.editMessageId === undefined
    && !item.photoUrl && !item.albumUrls?.length && !item.videoUrl && !item.videoFileId && !item.formulaTex;
  const bare = list.findIndex((item) => plain(item) && !item.replyMarkup);
  const target = bare >= 0 ? bare : list.findIndex(plain);
  const at = target >= 0 ? target : 0;
  const next = list.map((item, index) => index === at ? { ...item, replyKeyboard: keyboard } : item);
  const [first, ...rest] = next;
  if (!first) return reply;
  return rest.length > 0 ? { ...first, continuation: rest } : first;
}

export function attachReplyKeyboardList(replies: TelegramReply[], keyboard: ReplyKeyboardMarkup): TelegramReply[] {
  const [first, ...rest] = replies;
  if (!first) return replies;
  const packed = attachReplyKeyboard(rest.length > 0 ? { ...first, continuation: rest } : first, keyboard);
  const { continuation, ...head } = packed;
  return [head, ...(continuation ?? [])];
}
