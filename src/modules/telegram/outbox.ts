import "server-only";

import { optionalTelegramBot } from "@/modules/marathons/daily/botLink";
import {
  claimMarathonTelegram,
  enqueueMarathonTelegram,
  finishMarathonTelegram,
} from "@/modules/marathons/daily/store";
import { deliverTelegramReplies } from "./deliver";
import type { TelegramReply } from "./taskInteraction";

export function serializeReply(reply: TelegramReply): string {
  const { continuation: _continuation, ...rest } = reply;
  return JSON.stringify(rest);
}

function readReply(payload: string): TelegramReply | null {
  try {
    const value = JSON.parse(payload) as TelegramReply;
    if (!value || typeof value.chatId !== "string" || typeof value.text !== "string") return null;
    return value;
  } catch {
    return null;
  }
}

export async function rememberDeferred(replies: TelegramReply[]): Promise<void> {
  if (replies.length === 0) return;
  await enqueueMarathonTelegram(replies.map((reply) => ({
    chatId: reply.chatId,
    payload: serializeReply(reply),
  })));
}

/** Continues anything the webhook did not finish. Safe to call from cron. */
export async function drainTelegramOutbox(options: { budgetMs?: number } = {}): Promise<number> {
  const bot = optionalTelegramBot();
  if (!bot) return 0;
  const started = Date.now();
  const budgetMs = options.budgetMs ?? 8_000;
  const rows = await claimMarathonTelegram(12);
  let sent = 0;
  for (const row of rows) {
    if (Date.now() - started > budgetMs) break;
    const reply = readReply(row.payload);
    if (!reply) {
      await finishMarathonTelegram(row.id, "failed", null);
      continue;
    }
    const result = await deliverTelegramReplies([reply], bot.token, {
      budgetMs: Math.max(500, budgetMs - (Date.now() - started)),
      startedAt: started,
    });
    if (result.sent > 0 && result.deferred.length === 0) {
      await finishMarathonTelegram(row.id, "sent", null);
      sent += 1;
      continue;
    }
    if (row.attempts >= 5) {
      await finishMarathonTelegram(row.id, "failed", null);
      continue;
    }
    await finishMarathonTelegram(row.id, "pending", new Date(Date.now() + 20_000));
  }
  return sent;
}
