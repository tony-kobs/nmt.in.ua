import "server-only";

import { optionalTelegramBot } from "@/modules/marathons/daily/botLink";
import {
  claimMarathonTelegram,
  enqueueMarathonTelegram,
  finishMarathonTelegram,
  postponeMarathonTelegram,
  recordMaterialsDelivered,
} from "@/modules/marathons/daily/store";
import { deliverTelegramReplies } from "./deliver";
import { loadQuietHoursByChat, shouldHoldForQuietHours, type TelegramSendTrigger } from "./preferences";
import { loadTelegramConnection } from "./schema";
import { getKyivClock } from "./taskDay";
import type { TelegramReply } from "./taskInteraction";

/** How long a system row waits before the next quiet-hour check. Cron runs every few minutes. */
export const QUIET_HOLD_RETRY_MS = 5 * 60 * 1000;

export function serializeReply(reply: TelegramReply): string {
  const { continuation: _continuation, ...rest } = reply;
  return JSON.stringify(rest);
}

function readReply(payload: string): TelegramReply | null {
  try {
    const value = JSON.parse(payload) as TelegramReply;
    if (!value || typeof value.chatId !== "string" || typeof value.text !== "string") return null;
    if (value.trigger !== "user" && value.trigger !== "system") delete value.trigger;
    return value;
  } catch {
    return null;
  }
}

export async function rememberDeferred(
  replies: TelegramReply[],
  trigger: TelegramSendTrigger = "user",
  marathonId?: number | null,
): Promise<void> {
  if (replies.length === 0) return;
  await enqueueMarathonTelegram(replies.map((reply) => ({
    chatId: reply.chatId,
    marathonId: marathonId ?? null,
    payload: serializeReply({ ...reply, trigger: reply.trigger ?? trigger }),
  })));
}

async function heldSystemChats(chatIds: string[], nowMs: number): Promise<Set<string>> {
  if (chatIds.length === 0) return new Set();
  const connection = await loadTelegramConnection();
  try {
    const map = await loadQuietHoursByChat(connection, chatIds);
    const hour = getKyivClock(Math.floor(nowMs / 1000)).hour;
    const held = new Set<string>();
    for (const chatId of new Set(chatIds)) {
      if (shouldHoldForQuietHours(map.get(chatId), hour, "system")) held.add(chatId);
    }
    return held;
  } finally {
    connection.release();
  }
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
    /** Chats whose system rows must wait. Injected in tests. Production reads quiet hours. */
    holdSystem?: (chatIds: string[]) => Promise<Set<string>>;
    /** Puts a system row back without counting the quiet wait as a failed attempt. */
    postpone?: (id: number, notBefore: Date) => Promise<void>;
  };
} = {}): Promise<number> {
  const deps = options.deps ?? {};
  const token = deps.token ?? optionalTelegramBot()?.token;
  if (!token) return 0;
  const now = deps.now ?? Date.now;
  const claim = deps.claim ?? claimMarathonTelegram;
  const finish = deps.finish ?? finishMarathonTelegram;
  const deliver = deps.deliver ?? deliverTelegramReplies;
  const postpone = deps.postpone
    ?? (options.deps?.finish
      ? async (id: number, notBefore: Date) => { await finish(id, "pending", notBefore); }
      : postponeMarathonTelegram);
  const holdSystem = deps.holdSystem
    ?? (options.deps
      ? undefined
      : async (chatIds: string[]) => {
        try {
          return await heldSystemChats(chatIds, now());
        } catch (error) {
          console.error("telegram quiet hours", error);
          return new Set<string>();
        }
      });
  const started = now();
  const budgetMs = options.budgetMs ?? 8_000;
  const blockedChats = new Set<string>();
  let sent = 0;
  while (now() - started < budgetMs) {
    const rows = await claim(OUTBOX_CLAIM_BATCH);
    if (rows.length === 0) break;
    const parsed = rows.map((row) => ({ row, reply: readReply(row.payload) }));
    let held = new Set<string>();
    if (holdSystem) {
      const systemChats = parsed
        .filter((item) => item.reply?.trigger === "system")
        .map((item) => item.row.chatId);
      if (systemChats.length > 0) held = await holdSystem(systemChats);
    }
    let progressed = false;
    for (const { row, reply } of parsed) {
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
      if (reply?.trigger === "system" && held.has(row.chatId)) {
        // Leave the chat unblocked: a reply the person just asked for still goes out.
        await postpone(row.id, new Date(now() + QUIET_HOLD_RETRY_MS));
        continue;
      }
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
