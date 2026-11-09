import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { reportSupportForward } from "@/modules/support/store";
import {
  postSupportChatMessage,
  type SupportChatEnv,
} from "@/modules/support/postChat";
import {
  escapeTelegramHtml,
  TELEGRAM_HTML_LIMIT,
} from "@/modules/telegram/telegramHtml";

/** User-facing form. Shorter than the bot's 15s send so a silent Telegram does not hold the page. */
export const FEEDBACK_SUPPORT_TIMEOUT_MS = 5_000;

export type FeedbackSupportMessage = {
  title: string;
  type: string;
  authorName: string | null;
  authorLogin: string | null;
  email: string | null;
  message: string | null;
  absoluteLink: string;
};

export type FeedbackSupportDeps = {
  getConnection: () => Promise<SqlConnection>;
  request?: typeof fetch;
  env?: SupportChatEnv;
  log?: (...args: unknown[]) => void;
  timeoutMs?: number;
};

/** Name, @login and email, whichever the row actually has. */
export function feedbackSupportAuthor(input: {
  authorName: string | null;
  authorLogin: string | null;
  email: string | null;
}): string {
  const name = input.authorName?.trim() ?? "";
  const login = input.authorLogin?.trim() ?? "";
  const email = input.email?.trim() ?? "";
  const parts: string[] = [];
  if (name) parts.push(name);
  if (login) parts.push(`@${login}`);
  if (email) parts.push(email);
  return parts.length > 0 ? parts.join(", ") : "Гість";
}

function linkLine(absoluteLink: string): string {
  const link = absoluteLink.trim();
  if (!link) return "";
  const visible = escapeTelegramHtml(link);
  if (!/^https?:\/\//i.test(link)) return `Посилання: ${visible}`;
  const href = visible.replaceAll('"', "&quot;");
  return `Посилання: <a href="${href}">${visible}</a>`;
}

function clipUnits(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 1) return "…";
  let end = max - 1;
  const before = value.charCodeAt(end - 1);
  if (before >= 0xd800 && before <= 0xdbff) end -= 1;
  return `${value.slice(0, Math.max(0, end))}…`;
}

/**
 * HTML for the team chat. Visitor text is escaped for parse_mode HTML,
 * so `<` and `&` stay text. The title tags are ours.
 */
export function feedbackSupportHtml(input: FeedbackSupportMessage): string {
  const author = escapeTelegramHtml(feedbackSupportAuthor(input));
  const link = linkLine(input.absoluteLink);
  const title = escapeTelegramHtml(input.title.trim() || "Новий відгук");
  const type = escapeTelegramHtml(input.type.trim() || "відгук");
  const assemble = (body: string) =>
    [
      `<b>${title}</b>`,
      `Тип: ${type}`,
      `Автор: ${author}`,
      `Текст: ${body}`,
      link,
    ]
      .filter((line) => line.length > 0)
      .join("\n");

  const raw = input.message?.trim() ?? "";
  const body = escapeTelegramHtml(raw || "—");
  const text = assemble(body);
  if (text.length <= TELEGRAM_HTML_LIMIT) return text;

  const room = TELEGRAM_HTML_LIMIT - assemble("").length;
  const clipped = clipUnits(body, Math.max(1, room));
  const fitted = assemble(clipped);
  return fitted.length <= TELEGRAM_HTML_LIMIT
    ? fitted
    : fitted.slice(0, TELEGRAM_HTML_LIMIT);
}

function withTimeout(request: typeof fetch, timeoutMs: number): typeof fetch {
  return (url, init) => {
    const budget = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal
      ? AbortSignal.any([init.signal, budget])
      : budget;
    return request(url, { ...init, signal });
  };
}

/**
 * Copies one saved site feedback into TELEGRAM_SUPPORT_CHAT_ID.
 * A missing chat, a missing bot, a timeout and a Telegram error are logged.
 * This never throws: the row and the admin email already stand on their own.
 */
export async function deliverFeedbackToSupportChat(
  input: FeedbackSupportMessage,
  deps: FeedbackSupportDeps,
): Promise<void> {
  const log = deps.log ?? console.error;
  const timeoutMs = deps.timeoutMs ?? FEEDBACK_SUPPORT_TIMEOUT_MS;
  const text = feedbackSupportHtml(input);
  try {
    const posted = await postSupportChatMessage(
      {
        text,
        request: withTimeout(deps.request ?? fetch, timeoutMs),
      },
      deps.env ?? process.env,
    );
    if (!posted.sent) {
      log("feedback support chat skipped", posted.reason);
      return;
    }
    if (posted.result.status === "sent") return;
    const connection = await deps.getConnection();
    try {
      await reportSupportForward(posted.result, connection, log);
    } finally {
      connection.release();
    }
  } catch (error) {
    log(
      "feedback support chat",
      error instanceof Error ? error.name : "UnknownError",
    );
  }
}
