import "server-only";
import type { TelegramReply } from "./taskInteraction";

export type TelegramSendResult = { status: "sent"; messageId: number }
  | { status: "rejected" | "unknown"; context: { httpStatus?: number; errorCode?: number; errorName?: string; retryAfter?: number } };

function readRetryAfter(body: unknown): number | undefined {
  if (!body || typeof body !== "object") return undefined;
  const retryAfter = (body as { parameters?: { retry_after?: unknown } }).parameters?.retry_after;
  return typeof retryAfter === "number" && Number.isFinite(retryAfter) ? retryAfter : undefined;
}

function interpret(response: Response, body: unknown): TelegramSendResult {
  if (body && typeof body === "object") {
    const payload = body as { ok?: unknown; error_code?: unknown; result?: { message_id?: unknown } };
    const retryAfter = readRetryAfter(body);
    if (payload.ok === false && typeof payload.error_code === "number") {
      return {
        status: "rejected",
        context: {
          httpStatus: response.status,
          errorCode: payload.error_code,
          ...(retryAfter != null ? { retryAfter } : {}),
        },
      };
    }
    if (response.ok && payload.ok === true && Number.isSafeInteger(payload.result?.message_id)) {
      return { status: "sent", messageId: payload.result!.message_id as number };
    }
    if (response.ok && payload.ok === true && Array.isArray(payload.result) && payload.result.length > 0) {
      const first = payload.result[0] as { message_id?: unknown };
      if (Number.isSafeInteger(first?.message_id)) {
        return { status: "sent", messageId: first.message_id as number };
      }
    }
  }
  return { status: "unknown", context: { httpStatus: response.status } };
}

export async function sendTelegramMessage(reply: TelegramReply, botToken: string, request: typeof fetch = fetch): Promise<TelegramSendResult> {
  const body: Record<string, unknown> = { chat_id: reply.chatId, text: reply.text };
  if (reply.parseMode) body.parse_mode = reply.parseMode;
  if (reply.replyMarkup) body.reply_markup = reply.replyMarkup;
  if (reply.linkPreviewUrl) {
    body.link_preview_options = {
      is_disabled: false,
      url: reply.linkPreviewUrl,
      prefer_large_media: true,
      show_above_text: true,
    };
  }
  return sendTelegramPayload({
    method: "sendMessage",
    token: botToken,
    request,
    json: body,
  });
}

export async function sendTelegramPayload(input: {
  method: string;
  token: string;
  request?: typeof fetch;
  json?: Record<string, unknown>;
  fields?: Record<string, string>;
  file?: { field: string; filename: string; bytes: Uint8Array; type: string };
}): Promise<TelegramSendResult> {
  const request = input.request ?? fetch;
  try {
    let body: BodyInit;
    const headers: Record<string, string> = {};
    if (input.file) {
      const form = new FormData();
      for (const [key, value] of Object.entries(input.fields ?? {})) {
        if (value) form.set(key, value);
      }
      form.set(
        input.file.field,
        new Blob([Buffer.from(input.file.bytes)], { type: input.file.type }),
        input.file.filename,
      );
      body = form;
    } else {
      headers["content-type"] = "application/json";
      body = JSON.stringify(input.json ?? {});
    }
    const response = await request(`https://api.telegram.org/bot${input.token}/${input.method}`, {
      method: "POST",
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const parsed: unknown = await response.json();
    return interpret(response, parsed);
  } catch (error) {
    return { status: "unknown", context: { errorName: error instanceof Error ? error.name : "UnknownError" } };
  }
}
