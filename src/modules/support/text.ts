import { renderResolved, resolveCopy, type CopyKey } from "@/modules/marathons/daily/copy";
import { marathonCallbackFromText, isQuizKeyboardText } from "@/modules/marathons/daily/botPlay";
import {
  accountCallbackFromText,
  MENU_CLOSE_LABEL,
  MENU_OPEN_LABEL,
} from "@/modules/telegram/replyKeyboard";
import { escapeTelegramHtml, TELEGRAM_HTML_LIMIT } from "@/modules/telegram/telegramHtml";

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
  kind: "text" | "photo";
  navigation: boolean;
  replyToMessageId: number | null;
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
      reply_to_message?: { message_id?: unknown };
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
  const replyRaw = message.reply_to_message?.message_id;
  const replyToMessageId = typeof replyRaw === "number" && Number.isSafeInteger(replyRaw) && replyRaw > 0
    ? replyRaw
    : null;
  return {
    chatId: String(message.from.id),
    userId: String(message.from.id),
    body,
    kind: hasPhoto ? "photo" : "text",
    navigation: raw ? isNavigationLabel(raw) : false,
    replyToMessageId,
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

const QUOTE_CHARS = 400;
const HEADER_CHARS = 300;

function clipChars(value: string, max: number): string {
  const chars = Array.from(value);
  if (chars.length <= max) return chars.join("");
  if (max <= 1) return "…";
  return `${chars.slice(0, max - 1).join("")}…`;
}

/** Caption when the question was a photo. A photo with no caption becomes the admin photo label. */
export function supportQuestionQuote(input: {
  body: string;
  photo: boolean;
  photoLabel: string;
}): string {
  const body = input.body.replace(/\s+/g, " ").trim();
  const label = input.photoLabel.trim() || "[фото]";
  if (input.photo && (!body || body === SUPPORT_PHOTO_BODY)) return label;
  return body || label;
}

/** Header, a Telegram blockquote of the question, then the answer. Stays inside the message limit. */
export function studentReplyHtml(input: {
  header: string;
  quote: string;
  answer: string;
}): string {
  const header = escapeTelegramHtml(clipChars(input.header.trim(), HEADER_CHARS));
  let quote = clipChars(input.quote.trim(), QUOTE_CHARS);
  let answer = input.answer.trim();
  const assemble = (q: string, a: string) =>
    [header, `<blockquote>${escapeTelegramHtml(q)}</blockquote>`, escapeTelegramHtml(a)]
      .filter((part) => part.length > 0)
      .join("\n\n");
  let text = assemble(quote, answer);
  let guard = 0;
  while (text.length > TELEGRAM_HTML_LIMIT && guard < 12) {
    guard += 1;
    const quoteChars = Array.from(quote).length;
    const answerChars = Array.from(answer).length;
    if (quoteChars > 40) quote = clipChars(quote, Math.max(40, Math.floor(quoteChars * 0.6)));
    else if (answerChars > 40) answer = clipChars(answer, Math.max(40, Math.floor(answerChars * 0.6)));
    else break;
    text = assemble(quote, answer);
  }
  return text.length > TELEGRAM_HTML_LIMIT ? text.slice(0, TELEGRAM_HTML_LIMIT) : text;
}

export function supportReplyButton(
  label: string,
  ticketId: number,
): { text: string; callback_data: string } {
  const text = Array.from(label.trim()).slice(0, 64).join("") || "✍️ Відповісти";
  return { text, callback_data: `sp:r:${ticketId}` };
}

/** What the student receives. There is no student ticket page, so the button has no link. */
export function composeStudentReply(input: {
  ticketId: number;
  question: string;
  photo: boolean;
  answer: string;
  copy: Partial<Record<CopyKey, string>> | null;
}): { text: string; button: { text: string; callback_data: string } } {
  const header = renderResolved("bot_support_reply_header", input.copy, { id: input.ticketId });
  const quote = supportQuestionQuote({
    body: input.question,
    photo: input.photo,
    photoLabel: resolveCopy("bot_support_reply_photo", input.copy),
  });
  return {
    text: studentReplyHtml({ header, quote, answer: input.answer }),
    button: supportReplyButton(resolveCopy("bot_support_reply_btn", input.copy), input.ticketId),
  };
}

export function teamFollowupHtml(input: {
  id: number;
  displayName: string;
  body: string;
}): string {
  const name = input.displayName.trim() || "учасник";
  const quote = clipChars(input.body.trim(), QUOTE_CHARS);
  return [
    `<b>Продовження #${input.id}</b>`,
    escapeTelegramHtml(name),
    "",
    `<blockquote>${escapeTelegramHtml(quote)}</blockquote>`,
  ].join("\n");
}

/** «Відповісти» on the bot's answer. Private chat, and the sender owns that chat. */
export function readSupportReplyPress(update: unknown): {
  queryId: string;
  chatId: string;
  ticketId: number;
} | null {
  if (!update || typeof update !== "object") return null;
  const q = (update as {
    callback_query?: {
      id?: unknown;
      data?: unknown;
      from?: { id?: number };
      message?: { chat?: { id?: number; type?: string } };
    };
  }).callback_query;
  if (!q || typeof q.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(q.id)) return null;
  if (typeof q.data !== "string" || q.data.length > 64) return null;
  const match = /^sp:r:([1-9]\d{0,17})$/.exec(q.data);
  if (!match || !q.from || !q.message?.chat) return null;
  const fromId = q.from.id;
  if (typeof fromId !== "number" || !Number.isSafeInteger(fromId) || fromId <= 0) return null;
  if (q.message.chat.type !== "private" || q.message.chat.id !== fromId) return null;
  const ticketId = Number(match[1]);
  if (!Number.isSafeInteger(ticketId) || ticketId <= 0) return null;
  return { queryId: q.id, chatId: String(fromId), ticketId };
}
