import "server-only";

import { optionalTelegramBot } from "@/modules/marathons/daily/botLink";
import {
  sendTelegramMessage,
  type TelegramSendResult,
} from "@/modules/telegram/transport";
import { readSupportChatId } from "./text";

export type SupportChatEnv = {
  TELEGRAM_SUPPORT_CHAT_ID?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_BOT_USERNAME?: string;
  [key: string]: string | undefined;
};

export type SupportChatPost =
  | { sent: false; reason: "no_chat" | "no_bot" }
  | { sent: true; result: TelegramSendResult };

/**
 * One HTML message in the team chat, the same send the Help button uses.
 * `null` is not used: a missing chat id and a missing bot are different skips.
 * Telegram HTTP errors stay inside the result. Callers log them.
 */
export async function postSupportChatMessage(
  input: {
    text: string;
    replyToMessageId?: number;
    request?: typeof fetch;
  },
  env: SupportChatEnv = process.env,
): Promise<SupportChatPost> {
  const team = readSupportChatId(env.TELEGRAM_SUPPORT_CHAT_ID);
  if (!team) return { sent: false, reason: "no_chat" };
  const bot = optionalTelegramBot(env);
  if (!bot) return { sent: false, reason: "no_bot" };
  const result = await sendTelegramMessage(
    {
      chatId: team,
      text: input.text,
      parseMode: "HTML",
      disablePreview: true,
      ...(input.replyToMessageId
        ? { replyToMessageId: input.replyToMessageId }
        : {}),
    },
    bot.token,
    input.request,
  );
  return { sent: true, result };
}
