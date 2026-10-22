import { renderResolved, type CopyKey } from "@/modules/marathons/daily/copy";
import { marathonCallbackFromText, isQuizKeyboardText } from "@/modules/marathons/daily/botPlay";
import {
  accountCallbackFromText,
  MENU_CLOSE_LABEL,
  MENU_OPEN_LABEL,
} from "@/modules/telegram/replyKeyboard";
import { escapeTelegramHtml } from "@/modules/telegram/telegramHtml";

export const SUPPORT_PHOTO_BODY = "Фото";

const UNLINK_LABELS = new Set([
  "Відв'язати",
  "Відв’язати",
  "Відв'язати Telegram",
  "Відв’язати Telegram",
]);

export type PrivateNote = {
  chatId: string;
  userId: string;
  body: string | null;
  navigation: boolean;
};

export type IntakeDecision = "ignore" | "cancel" | "ticket";

/** A command, cabinet label, marathon label, or quiz label must not become a ticket. */
export function isNavigationLabel(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/")) return true;
  if (trimmed.length > 64) return false;
  if (trimmed === MENU_OPEN_LABEL || trimmed === MENU_CLOSE_LABEL) return true;
  if (accountCallbackFromText(trimmed)) return true;
  if (marathonCallbackFromText(trimmed, undefined)) return true;
  if (isQuizKeyboardText(trimmed)) return true;
  return UNLINK_LABELS.has(trimmed);
}

function clip(value: string): string {
  return Array.from(value).slice(0, 4000).join("");
}

/** Text, photo caption, or a photo with no caption. Group chats and foreign senders are ignored. */
export function readPrivateNote(update: unknown): PrivateNote | null {
  if (!update || typeof update !== "object") return null;
  const message = (update as {
    message?: {
      chat?: { id?: number; type?: string };
      from?: { id?: number };
      text?: unknown;
      caption?: unknown;
      photo?: unknown;
    };
  }).message;
  if (!message?.chat || !message.from || message.chat.type !== "private") return null;
  if (!Number.isSafeInteger(message.from.id) || Number(message.from.id) <= 0) return null;
  if (message.chat.id !== message.from.id) return null;
  const text = typeof message.text === "string" ? message.text.trim() : "";
  const caption = typeof message.caption === "string" ? message.caption.trim() : "";
  const raw = text || caption;
  const hasPhoto = Array.isArray(message.photo) && message.photo.length > 0;
  const body = raw ? clip(raw) : hasPhoto ? SUPPORT_PHOTO_BODY : null;
  return {
    chatId: String(message.from.id),
    userId: String(message.from.id),
    body,
    navigation: raw ? isNavigationLabel(raw) : false,
  };
}

/** While a wait is open, navigation cancels it. Anything else with a body is the ticket. */
export function intakeDecision(
  note: { body: string | null; navigation: boolean },
  waiting: boolean,
): IntakeDecision {
  if (!waiting) return "ignore";
  if (note.navigation) return "cancel";
  if (!note.body) return "ignore";
  return "ticket";
}

export function readSupportChatId(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!/^-?[1-9]\d{0,18}$/.test(value)) return null;
  return value;
}

/** Show the id Telegram returned until the env already uses that same chat. */
export function supportMigrationNotice(
  stored: string | null | undefined,
  configured: string | null | undefined,
): string | null {
  const next = readSupportChatId(stored ?? undefined);
  if (!next) return null;
  if (readSupportChatId(configured ?? undefined) === next) return null;
  return next;
}

export const TICKET_STATUSES = ["new", "in_progress", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export function parseTicketStatus(value: string | undefined): TicketStatus | null {
  const text = (value ?? "").trim();
  return (TICKET_STATUSES as readonly string[]).includes(text) ? text as TicketStatus : null;
}

export function parseTicketFilter(value: string | undefined): TicketStatus | "all" {
  return parseTicketStatus(value) ?? "all";
}

/** Admin-editable line. Empty when the marathon has no public chat URL. */
export function publicChatNotice(
  url: string | null | undefined,
  copy: Partial<Record<CopyKey, string>> | null | undefined,
): string | null {
  const link = (url ?? "").trim();
  if (!link) return null;
  const text = renderResolved("bot_help_chat", copy, { link }).trim();
  return text || null;
}

export function teamTicketHtml(input: {
  id: number;
  displayName: string;
  marathonTitle: string | null;
  dayNumber: number | null;
  chatId: string;
  body: string;
}): string {
  const name = input.displayName.trim() || "учасник";
  const marathon = input.marathonTitle?.trim() || "—";
  const day = input.dayNumber == null ? "—" : String(input.dayNumber);
  return [
    `<b>Звернення #${input.id}</b>`,
    escapeTelegramHtml(name),
    `Марафон: ${escapeTelegramHtml(marathon)}`,
    `День: ${escapeTelegramHtml(day)}`,
    `Чат: ${escapeTelegramHtml(input.chatId)}`,
    "",
    escapeTelegramHtml(input.body),
  ].join("\n");
}
