import type { ReplyKeyboardMarkup, TelegramReply } from "./taskInteraction";
import { MAIN_MENU_LABEL, MENU } from "./ui";

type MenuButton = { text: string; callbackData: string };

/**
 * Cabinet menu under the input. It is not repeated as inline buttons in the chat.
 * Marathon and topic tests open their own screens.
 */
export const ACCOUNT_MENU = {
  marathon: { text: "🏁 Марафон", callbackData: "mh:menu" },
  quiz: { text: "📝 Тести за темою", callbackData: "mh:quiz" },
  today: { text: "📅 Сьогодні", callbackData: MENU.today },
  tasks: { text: "📚 Мої завдання", callbackData: MENU.tasks },
  stats: { text: "📊 Моя статистика", callbackData: MENU.stats },
  notifications: { text: "🔔 Сповіщення", callbackData: MENU.notifications },
  account: { text: "👤 Мій акаунт", callbackData: MENU.account },
  help: { text: "❓ Допомога", callbackData: MENU.help },
  students: { text: "👥 Мої учні", callbackData: MENU.students },
  home: { text: MAIN_MENU_LABEL, callbackData: MENU.home },
} as const satisfies Record<string, MenuButton>;

export type AccountMenuRole = "student" | "teacher";

export function accountMenuRows(role: AccountMenuRole): MenuButton[][] {
  const button = ACCOUNT_MENU;
  if (role === "teacher") {
    return [
      [button.students],
      [button.notifications, button.account],
      [button.help],
    ];
  }
  return [
    [button.marathon, button.quiz],
    [button.today, button.tasks],
    [button.stats, button.notifications],
    [button.account, button.help],
  ];
}

export function toReplyKeyboard(rows: { text: string }[][]): ReplyKeyboardMarkup {
  return {
    keyboard: rows.map((row) => row.map((button) => ({ text: button.text }))),
    resize_keyboard: true,
    is_persistent: true,
  };
}

export const MENU_OPEN_LABEL = "☰ Меню";
export const MENU_CLOSE_LABEL = "✕ Закрити";

/** One row under the input. It stays put and only toggles the section list. */
export function collapsedMenuKeyboard(): ReplyKeyboardMarkup {
  return {
    keyboard: [[{ text: MENU_OPEN_LABEL }]],
    resize_keyboard: true,
    is_persistent: true,
  };
}

/** Section list for this role, plus the same button used to fold it away. */
export function expandedMenuKeyboard(role: AccountMenuRole): ReplyKeyboardMarkup {
  return toReplyKeyboard([...accountMenuRows(role), [{ text: MENU_CLOSE_LABEL }]]);
}

export function accountReplyKeyboard(_role: AccountMenuRole): ReplyKeyboardMarkup {
  return collapsedMenuKeyboard();
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
