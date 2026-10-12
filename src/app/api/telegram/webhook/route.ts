import {
  handleMarathonGateway,
  marathonBareStart,
  marathonLinkText,
  marathonWelcome,
} from "@/modules/marathons/daily/botGateway";
import { findParticipantByChat } from "@/modules/marathons/daily/store";
import { readTelegramConfig } from "@/modules/telegram/config";
import { consumeTelegramLink } from "@/modules/telegram/link";
import { deliverTelegramReplies } from "@/modules/telegram/deliver";
import { drainTelegramOutbox, rememberDeferred } from "@/modules/telegram/outbox";
import { handleTelegramUpdate, verifyTelegramWebhookSecret } from "@/modules/telegram/webhook";
import type { TelegramReply } from "@/modules/telegram/taskInteraction";

function flattenReplies(reply: TelegramReply | null): TelegramReply[] {
  if (!reply) return [];
  const { continuation, ...message } = reply;
  const more = (continuation ?? []).map(({ continuation: _nested, ...item }) => item);
  return [message, ...more];
}

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  let config: ReturnType<typeof readTelegramConfig>;
  try {
    config = readTelegramConfig();
  } catch {
    return new Response(null, { status: 503 });
  }
  if (!verifyTelegramWebhookSecret(
    request.headers.get("x-telegram-bot-api-secret-token"),
    config.webhookSecret,
  )) return new Response(null, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 65536) {
    return new Response(null, { status: 413 });
  }
  let update: unknown;
  try {
    const body = await request.text();
    if (body.length > 65536) return new Response(null, { status: 413 });
    update = JSON.parse(body) as unknown;
  } catch {
    return new Response(null, { status: 400 });
  }
  try {
    const reply = await handleTelegramUpdate(update, {
      consume: consumeTelegramLink,
      marathon: handleMarathonGateway,
      marathonBareStart,
      marathonLinkText,
      marathonWelcome,
      menu: { hasMarathon: async (chatId) => Boolean(await findParticipantByChat(chatId)) },
      acknowledgeCallback: async (queryId) => {
        const response = await fetch(`https://api.telegram.org/bot${config.botToken}/answerCallbackQuery`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ callback_query_id: queryId }), cache: "no-store",
        });
        if (!response.ok) throw new Error("Telegram callback acknowledgement failed");
      },
    });
    const replies = flattenReplies(reply);
    const delivered = await deliverTelegramReplies(replies, config.botToken, { budgetMs: 6_000 });
    if (delivered.deferred.length > 0) {
      await rememberDeferred(delivered.deferred);
      try {
        const { after } = await import("next/server");
        after(() => {
          void drainTelegramOutbox({ budgetMs: 20_000 }).catch((error: unknown) => {
            console.error("telegram outbox", error);
          });
        });
      } catch (error) {
        console.error("telegram outbox schedule", error);
      }
    }
  } catch (error) {
    console.error("telegram webhook failed", error);
  }
  return new Response(null, { status: 200 });
}
