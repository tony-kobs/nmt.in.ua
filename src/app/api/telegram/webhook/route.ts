import {
  handleMarathonGateway,
  marathonBareStart,
  marathonLinkText,
} from "@/modules/marathons/daily/botGateway";
import { readTelegramConfig } from "@/modules/telegram/config";
import { consumeTelegramLink } from "@/modules/telegram/link";
import { sendTelegramMessage } from "@/modules/telegram/transport";
import { handleTelegramUpdate, verifyTelegramWebhookSecret } from "@/modules/telegram/webhook";
import type { TelegramReply } from "@/modules/telegram/taskInteraction";

function flattenReplies(reply: TelegramReply | null): TelegramReply[] {
  if (!reply) return [];
  const { continuation, ...message } = reply;
  const more = (continuation ?? []).map(({ continuation: _nested, ...item }) => item);
  return [message, ...more];
}

export const runtime = "nodejs";

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
      acknowledgeCallback: async (queryId) => {
        const response = await fetch(`https://api.telegram.org/bot${config.botToken}/answerCallbackQuery`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ callback_query_id: queryId }), cache: "no-store",
        });
        if (!response.ok) throw new Error("Telegram callback acknowledgement failed");
      },
    });
    const replies = flattenReplies(reply);
    for (const item of replies) {
      const result = await sendTelegramMessage(item, config.botToken);
      if (result.status !== "sent") {
        console.error("telegram webhook delivery failed", result.context);
      }
    }
  } catch (error) {
    console.error("telegram webhook failed", error);
  }
  return new Response(null, { status: 200 });
}
