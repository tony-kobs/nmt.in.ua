import { absoluteUrl } from "@/constants/seo";
import { escapeTelegramHtml } from "./telegramHtml";
import { TELEGRAM_TASK_TIME_ZONE } from "./taskDay";
import type { InlineKeyboard, TelegramReply } from "./taskInteraction";

type Button = InlineKeyboard["inline_keyboard"][number][number];

/** Menu callbacks carry no data beyond the screen name; every screen re-resolves the account. */
export const MENU = {
  home: "m:home",
  tasks: "m:tasks",
  today: "m:today",
  stats: "m:stats",
  notifications: "m:notif",
  account: "m:acct",
  help: "m:help",
  students: "m:stud",
  leaderboard: "m:lb",
} as const;

export const NOT_LINKED_TEXT = "Спочатку підключіть Telegram у своєму кабінеті на nmt.in.ua.";
export const STALE_TEXT = "Ця кнопка застаріла. Відкрийте меню ще раз.";

const deadlineFormatter = new Intl.DateTimeFormat("uk-UA", {
  timeZone: TELEGRAM_TASK_TIME_ZONE,
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});

export function formatKyivDateTime(unixSec: number): string {
  return deadlineFormatter.format(unixSec * 1000);
}

export function html(value: string): string {
  return escapeTelegramHtml(value);
}

export function cleanTitle(name: string | null | undefined, fallback = "Навчальна сесія"): string {
  return Array.from((name || fallback).replace(/\s+/g, " ").trim() || fallback).slice(0, 120).join("");
}

/** The earlier of the session expiry and an active assignment due time — the moment the task stops being doable. */
export function effectiveDeadline(task: { expiresAt: number | null; dueAt?: number | null }): number | null {
  const values = [task.expiresAt, task.dueAt].filter((value): value is number => typeof value === "number" && value > 0);
  return values.length ? Math.min(...values) : null;
}

export function siteButton(text: string, path: string): Button {
  return { text, url: absoluteUrl(path) };
}

export function menuButton(): Button {
  return { text: "🏠 Головне меню", callback_data: MENU.home };
}

/** Contextual navigation row: optional Back to the parent screen, then Main Menu. */
export function navRow(back?: { text?: string; data: string }): Button[] {
  return back ? [{ text: back.text ?? "⬅️ Назад", callback_data: back.data }, menuButton()] : [menuButton()];
}

export function screen(chatId: string, text: string, rows: Button[][], editMessageId?: number): TelegramReply {
  return {
    chatId,
    text,
    parseMode: "HTML",
    disablePreview: true,
    ...(rows.length ? { replyMarkup: { inline_keyboard: rows } } : {}),
    ...(editMessageId !== undefined ? { editMessageId } : {}),
  };
}
