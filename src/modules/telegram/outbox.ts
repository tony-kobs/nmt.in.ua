import "server-only";

import { optionalTelegramBot } from "@/modules/marathons/daily/botLink";
import {
  claimMarathonTelegram,
  enqueueMarathonTelegram,
  finishMarathonTelegram,
  recordMaterialsDelivered,
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

export const OUTBOX_CLAIM_BATCH = 30;

/**
 * Sends queued replies in id order until the budget runs out, claiming more batches as it goes.
 * After a failure in a chat, later rows of that chat wait for the next run so order is kept.
 * Safe to call from cron and from the webhook.
 */
export async function drainTelegramOutbox(options: {
  budgetMs?: number;
  deps?: {
    token?: string;
    claim?: typeof claimMarathonTelegram;
    finish?: typeof finishMarathonTelegram;
    deliver?: typeof deliverTelegramReplies;
    now?: () => number;
  };
} = {}): Promise<number> {
  const deps = options.deps ?? {};
  const token = deps.token ?? optionalTelegramBot()?.token;
  if (!token) return 0;
  const now = deps.now ?? Date.now;
  const claim = deps.claim ?? claimMarathonTelegram;
  const finish = deps.finish ?? finishMarathonTelegram;
  const deliver = deps.deliver ?? deliverTelegramReplies;
  const started = now();
  const budgetMs = options.budgetMs ?? 8_000;
  const blockedChats = new Set<string>();
  let sent = 0;
  while (now() - started < budgetMs) {
    const rows = await claim(OUTBOX_CLAIM_BATCH);
    if (rows.length === 0) break;
    let progressed = false;
    for (const row of rows) {
      if (blockedChats.has(row.chatId)) {
        // An earlier row of this chat failed; keep the order and retry with it.
        await finish(row.id, "pending", new Date(Date.now() + 20_000));
        continue;
      }
      if (now() - started > budgetMs) {
        // Claimed but untouched: make it available again right away.
        await finish(row.id, "pending", null);
        continue;
      }
      const reply = readReply(row.payload);
      if (!reply) {
        await finish(row.id, "failed", null);
        continue;
      }
      const result = await deliver([reply], token, {
        budgetMs: Math.max(500, budgetMs - (now() - started)),
        startedAt: started,
      });
      if (result.sent > 0 && result.deferred.length === 0) {
        await finish(row.id, "sent", null);
        const viewed = reply.materialsViewed;
        if (
          viewed
          && Number.isInteger(viewed.marathonId)
          && Number.isInteger(viewed.userId)
          && Number.isInteger(viewed.dayId)
        ) {
          try {
            await recordMaterialsDelivered(viewed.marathonId, viewed.userId, viewed.dayId, new Date());
          } catch (error) {
            console.error("marathon materials viewed", error);
          }
        }
        sent += 1;
        progressed = true;
        continue;
      }
      blockedChats.add(row.chatId);
      if (row.attempts >= 5) {
        console.error("marathon telegram outbox gave up", { id: row.id, chatId: row.chatId });
        await finish(row.id, "failed", null);
        blockedChats.delete(row.chatId);
        continue;
      }
      await finish(row.id, "pending", new Date(Date.now() + 20_000));
    }
    if (!progressed || rows.length < OUTBOX_CLAIM_BATCH) break;
  }
  return sent;
}
