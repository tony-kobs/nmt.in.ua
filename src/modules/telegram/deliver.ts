import "server-only";

import type { DeliveryPiece } from "@/modules/marathons/daily/telegramContent";
import type { InlineKeyboard, TelegramReply } from "./taskInteraction";
import { renderFormulaPng, type FormulaRenderer } from "./formulaImage";
import { sendThrottled, sharedTelegramPace, type SendOutcome } from "./throttle";
import { sendTelegramMessage, sendTelegramPayload, type TelegramSendResult } from "./transport";

export type DeliverOptions = {
  budgetMs?: number;
  request?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  renderFormula?: FormulaRenderer;
  startedAt?: number;
};

export function piecesToReplies(chatId: string, pieces: DeliveryPiece[]): TelegramReply[] {
  const replies: TelegramReply[] = [];
  for (const piece of pieces) {
    const buttons: { text: string; callback_data?: string; url?: string }[] = [];
    for (const button of piece.buttons ?? []) {
      const label = button.text.trim().slice(0, 64);
      if (!label) continue;
      if (button.url) buttons.push({ text: label, url: button.url });
      else if (button.data && button.data.length <= 64) buttons.push({ text: label, callback_data: button.data });
    }
    const text = piece.html ? piece.text : piece.text.trim().slice(0, 4096);
    const reply: TelegramReply = {
      chatId,
      text,
      ...(piece.html ? { parseMode: "HTML" } : {}),
      ...(buttons.length ? { replyMarkup: { inline_keyboard: buttons.map((button) => [button]) } } : {}),
      ...(piece.previewUrl ? { linkPreviewUrl: piece.previewUrl } : {}),
      ...(piece.photoUrl ? { photoUrl: piece.photoUrl } : {}),
      ...(piece.photoUrls ? { albumUrls: piece.photoUrls } : {}),
      ...(piece.videoUrl ? { videoUrl: piece.videoUrl } : {}),
      ...(piece.videoFileId ? { videoFileId: piece.videoFileId } : {}),
      ...(piece.formulaTex ? { formulaTex: piece.formulaTex, formulaDisplay: piece.formulaDisplay === true } : {}),
      ...(piece.siteUrl ? { siteUrl: piece.siteUrl } : {}),
      ...(piece.siteLabel ? { siteLabel: piece.siteLabel } : {}),
    };
    if (reply.text.trim() || reply.formulaTex || reply.photoUrl || reply.albumUrls || reply.videoUrl || reply.videoFileId || reply.linkPreviewUrl) {
      replies.push(reply);
    }
  }
  return replies;
}

function outcomeOf(result: TelegramSendResult): SendOutcome {
  if (result.status === "sent") return { ok: true };
  const retryAfter = result.context.retryAfter;
  return { ok: false, ...(retryAfter != null ? { retryAfter } : {}) };
}

function keyboard(reply: TelegramReply): InlineKeyboard | undefined {
  return reply.replyMarkup;
}

async function sendOne(
  reply: TelegramReply,
  token: string,
  options: DeliverOptions,
): Promise<TelegramSendResult> {
  const request = options.request ?? fetch;
  if (reply.formulaTex) {
    const png = await renderFormulaPng(
      reply.formulaTex,
      reply.formulaDisplay === true,
      options.renderFormula,
    );
    if (png) {
      return sendTelegramPayload({
        method: "sendPhoto",
        token,
        request,
        fields: {
          chat_id: reply.chatId,
          caption: reply.text.trim().slice(0, 1024),
          ...(reply.text.trim() && reply.parseMode ? { parse_mode: reply.parseMode } : {}),
          ...(keyboard(reply) ? { reply_markup: JSON.stringify(keyboard(reply)) } : {}),
        },
        file: { field: "photo", filename: "formula.png", bytes: png, type: "image/png" },
      });
    }
    const label = reply.siteLabel?.trim() || "Відкрити на сайті";
    const url = reply.siteUrl?.trim();
    return sendTelegramMessage({
      chatId: reply.chatId,
      text: url ? `${label}\n${url}` : label,
      ...(url ? { replyMarkup: { inline_keyboard: [[{ text: label.slice(0, 64), url }]] } } : {}),
    }, token, request);
  }
  if (reply.albumUrls && reply.albumUrls.length > 1) {
    const media = reply.albumUrls.map((url, index) => ({
      type: "photo",
      media: url,
      ...(index === 0 && reply.text.trim()
        ? { caption: reply.text.trim().slice(0, 1024), ...(reply.parseMode ? { parse_mode: reply.parseMode } : {}) }
        : {}),
    }));
    const group = await sendTelegramPayload({
      method: "sendMediaGroup",
      token,
      request,
      json: { chat_id: reply.chatId, media },
    });
    if (!reply.replyMarkup || group.status !== "sent") return group;
    const follow = await sendTelegramMessage({
      chatId: reply.chatId,
      text: reply.siteLabel?.trim() || "·",
      replyMarkup: reply.replyMarkup,
    }, token, request);
    return follow.status === "sent" ? group : follow;
  }
  if (reply.photoUrl) {
    return sendTelegramPayload({
      method: "sendPhoto",
      token,
      request,
      json: {
        chat_id: reply.chatId,
        photo: reply.photoUrl,
        ...(reply.text.trim() ? { caption: reply.text.trim().slice(0, 1024) } : {}),
        ...(reply.text.trim() && reply.parseMode ? { parse_mode: reply.parseMode } : {}),
        ...(keyboard(reply) ? { reply_markup: keyboard(reply) } : {}),
      },
    });
  }
  if (reply.videoUrl || reply.videoFileId) {
    return sendTelegramPayload({
      method: "sendVideo",
      token,
      request,
      json: {
        chat_id: reply.chatId,
        video: reply.videoUrl || reply.videoFileId,
        ...(reply.text.trim() ? { caption: reply.text.trim().slice(0, 1024) } : {}),
        ...(reply.text.trim() && reply.parseMode ? { parse_mode: reply.parseMode } : {}),
        ...(keyboard(reply) ? { reply_markup: keyboard(reply) } : {}),
      },
    });
  }
  if (reply.editMessageId !== undefined) {
    const edited = await sendTelegramMessage(reply, token, request);
    // Same content is already on screen; anything else (deleted, too old, media) gets a fresh message.
    if (edited.status === "sent" || edited.status === "unknown" || edited.context.notModified) {
      return edited.status === "rejected" ? { status: "sent", messageId: reply.editMessageId } : edited;
    }
    if (edited.context.retryAfter != null) return edited;
    const { editMessageId: _edit, ...fresh } = reply;
    return sendTelegramMessage(fresh, token, request);
  }
  return sendTelegramMessage(reply, token, request);
}

export async function deliverTelegramReplies(
  replies: TelegramReply[],
  token: string,
  options: DeliverOptions = {},
): Promise<{ sent: number; deferred: TelegramReply[] }> {
  const result = await sendThrottled(replies, {
    chatId: (reply) => reply.chatId,
    budgetMs: options.budgetMs,
    now: options.now,
    sleep: options.sleep,
    startedAt: options.startedAt,
    pace: options.now ? undefined : sharedTelegramPace(),
    send: async (reply) => outcomeOf(await sendOne(reply, token, options)),
  });
  return { sent: result.sent.length, deferred: result.deferred };
}
