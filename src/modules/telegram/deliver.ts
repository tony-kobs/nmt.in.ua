import "server-only";

import type { DeliveryPiece } from "@/modules/marathons/daily/telegramContent";
import type { InlineKeyboard, TelegramReply } from "./taskInteraction";
import { renderFormulaPng, type FormulaRenderer } from "./formulaImage";
import { latexToTelegramPlain } from "./latexPlain";
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
      const label = latexToTelegramPlain(button.text).slice(0, 64);
      if (!label) continue;
      if (button.url) buttons.push({ text: label, url: button.url });
      else if (button.data && button.data.length <= 64) buttons.push({ text: label, callback_data: button.data });
    }
    const plain = latexToTelegramPlain(piece.text);
    const text = piece.html ? plain : plain.slice(0, 4096);
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

function withSiteButton(reply: TelegramReply): InlineKeyboard | undefined {
  const rows = (reply.replyMarkup?.inline_keyboard ?? []).map((row) => [...row]);
  const url = reply.siteUrl?.trim();
  if (url && !rows.some((row) => row.some((button) => button.url === url))) {
    const label = (reply.siteLabel?.trim() || "Відкрити на сайті").slice(0, 64);
    rows.push([{ text: label, url }]);
  }
  return rows.length > 0 ? { inline_keyboard: rows } : undefined;
}

function formulaFallbackText(reply: TelegramReply): string {
  const caption = reply.text.trim();
  if (caption) return caption.slice(0, 4096);
  const url = reply.siteUrl?.trim();
  if (!url) return "";
  const label = reply.siteLabel?.trim() || "Відкрити на сайті";
  return `${label}\n${url}`.slice(0, 4096);
}

function formulaFallback(reply: TelegramReply): TelegramReply | null {
  const text = formulaFallbackText(reply);
  if (!text) return null;
  const markup = withSiteButton(reply);
  return {
    chatId: reply.chatId,
    text,
    ...(markup ? { replyMarkup: markup } : {}),
  };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&").slice(0, 4096);
}

/** Text stand-in for media Telegram refused (unreachable URL, SVG, too large, bad caption). */
export function mediaFallback(reply: TelegramReply): TelegramReply | null {
  const urls = reply.albumUrls?.length ? reply.albumUrls : reply.photoUrl ? [reply.photoUrl] : reply.videoUrl ? [reply.videoUrl] : [];
  const caption = reply.text.trim();
  if (urls.length === 0) {
    if (!reply.photoFileId || !caption) return null;
    const { photoFileId: _id, ...rest } = reply;
    return { ...rest, text: caption.slice(0, 4096) };
  }
  const text = [caption, ...urls.map((url) => `🖼 ${url}`)].filter(Boolean).join("\n").slice(0, 4096);
  const { photoUrl: _p, photoFileId: _id, albumUrls: _a, videoUrl: _v, videoFileId: _f, formulaTex: _tex, ...rest } = reply;
  const markup = withSiteButton(reply);
  return { ...rest, text, ...(markup ? { replyMarkup: markup } : {}) };
}

async function sendOne(
  reply: TelegramReply,
  token: string,
  options: DeliverOptions,
): Promise<TelegramSendResult> {
  const result = await sendOneRaw(reply, token, options);
  if (result.status !== "rejected" || result.context.retryAfter != null) return result;
  if (reply.formulaTex) {
    const fallback = formulaFallback(reply);
    if (fallback) return sendTelegramMessage(fallback, token, options.request ?? fetch);
  }
  console.error("telegram reply rejected", {
    chatId: reply.chatId,
    kind: reply.formulaTex ? "formula" : reply.albumUrls ? "album" : reply.photoUrl || reply.photoFileId ? "photo" : reply.videoUrl || reply.videoFileId ? "video" : "text",
    ...result.context,
  });
  const fallback = mediaFallback(reply);
  if (fallback) return sendTelegramMessage(fallback, token, options.request ?? fetch);
  if (reply.parseMode) {
    // Usually malformed HTML: send the same text without markup.
    const { parseMode: _mode, ...plain } = reply;
    return sendTelegramMessage({ ...plain, text: stripHtml(reply.text) }, token, options.request ?? fetch);
  }
  return result;
}

async function sendOneRaw(
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
    const fallback = formulaFallback(reply);
    if (fallback) return sendTelegramMessage(fallback, token, request);
    return { status: "sent", messageId: 0 };
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
  const photo = reply.photoFileId?.trim() || reply.photoUrl;
  if (photo) {
    return sendTelegramPayload({
      method: "sendPhoto",
      token,
      request,
      json: {
        chat_id: reply.chatId,
        photo,
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
  if (reply.dropAfterSend) {
    const sent = await sendTelegramMessage(reply, token, request);
    if (sent.status === "sent" && sent.messageId > 0) {
      await sendTelegramPayload({
        method: "deleteMessage",
        token,
        request,
        json: { chat_id: reply.chatId, message_id: sent.messageId },
      });
    }
    return sent;
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
): Promise<{ sent: number; deferred: TelegramReply[]; errorCode?: number }> {
  let errorCode: number | undefined;
  const result = await sendThrottled(replies, {
    chatId: (reply) => reply.chatId,
    budgetMs: options.budgetMs,
    now: options.now,
    sleep: options.sleep,
    startedAt: options.startedAt,
    pace: options.now ? undefined : sharedTelegramPace(),
    send: async (reply) => {
      const sent = await sendOne(reply, token, options);
      if (sent.status !== "sent" && sent.context.errorCode != null) errorCode = sent.context.errorCode;
      return outcomeOf(sent);
    },
  });
  return {
    sent: result.sent.length,
    deferred: result.deferred,
    ...(errorCode != null ? { errorCode } : {}),
  };
}
