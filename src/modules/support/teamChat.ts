import type { TelegramReply } from "@/modules/telegram/taskInteraction";
import { TELEGRAM_CAPTION_LIMIT } from "@/modules/marathons/daily/images";
import { isSlug } from "@/modules/marathons/daily/forms";

export const BROADCAST_KIND = "broadcast";
const BODY_LIMIT = 3500;
const DRAFT_MS = 60 * 60 * 1000;

export type TeamCourse = {
  id: number;
  slug: string;
  title: string;
  status: "draft" | "active" | "finished" | "archived";
};

export type TeamDraft = {
  id: number;
  marathonId: number;
  body: string;
  photoFileId: string | null;
  status: "draft" | "sent" | "cancelled";
  expired: boolean;
  previewChatId: string;
  previewMessageId: number | null;
  sentCount: number;
};

export type TeamEvent =
  | { type: "command"; chatId: string; userId: string; text: string; botUsername: string; photoFileId: string | null }
  | { type: "callback"; chatId: string; userId: string; queryId: string; data: string; messageId: number | null }
  | { type: "reply"; chatId: string; userId: string; text: string; replyToMessageId: number };

export type TeamDeps = {
  authorize: (userId: string) => Promise<boolean>;
  courses: () => Promise<TeamCourse[]>;
  recipients: (marathonId: number) => Promise<string[]>;
  saveDraft: (input: {
    marathonId: number;
    authorTgId: string;
    body: string;
    photoFileId: string | null;
    previewChatId: string;
    recipientCount: number;
  }) => Promise<number>;
  rememberPreview: (id: number, messageId: number) => Promise<void>;
  loadDraft: (id: number) => Promise<TeamDraft | null>;
  markSent: (id: number, count: number) => Promise<boolean>;
  setSentCount: (id: number, count: number) => Promise<void>;
  markCancelled: (id: number) => Promise<boolean>;
  revertToDraft: (id: number) => Promise<void>;
  enqueue: (input: {
    marathonId: number;
    chats: string[];
    body: string;
    photoFileId: string | null;
  }) => Promise<void>;
  send: (reply: TelegramReply) => Promise<{ ok: boolean; messageId?: number }>;
  scheduleDrain: () => void;
  findTicket: (messageId: number) => Promise<{ id: number } | null>;
  replyTicket: (id: number, text: string) => Promise<"ok" | "missing" | "send_failed">;
  acknowledge?: (queryId: string) => Promise<void>;
};

type CommandSplit = { key: string | null; body: string };

export function broadcastPreview(input: { title: string; body: string; count: number }): string {
  const head = `Марафон: ${input.title}\nОтримувачів: ${input.count}\n\n`;
  const room = 4096 - head.length;
  const body = room > 0 ? input.body.slice(0, room) : "";
  return `${head}${body}`.slice(0, 4096);
}

export function severalMarathonsText(courses: TeamCourse[]): string {
  const lines = courses.map((course) => `${course.id} ${course.slug} — ${course.title}`);
  return `Активних марафонів кілька. Вкажіть id або slug:\n${lines.join("\n")}`.slice(0, 4096);
}

/** `/all` and `/all@bot`. A mention of another bot is not ours. */
export function parseAllCommand(
  text: string,
  botUsername: string,
): { rest: string } | "foreign" | null {
  const trimmed = text.trim();
  const match = /^\/all(?:@([A-Za-z0-9_]{5,32}))?(?:\s+([\s\S]*))?$/.exec(trimmed);
  if (!match) return null;
  const mentioned = match[1];
  if (mentioned && mentioned.toLowerCase() !== botUsername.replace(/^@/, "").toLowerCase()) return "foreign";
  return { rest: (match[2] ?? "").trim() };
}

export function parseBroadcastCallback(data: string): { action: "send" | "cancel"; id: number } | null {
  const match = /^tb:(ok|no):([1-9]\d{0,17})$/.exec(data);
  if (!match) return null;
  const id = Number(match[2]);
  if (!Number.isSafeInteger(id)) return null;
  return { action: match[1] === "ok" ? "send" : "cancel", id };
}

/** First token is a marathon id or slug only when that course exists and a text follows, or the token is the whole target with empty text. */
export function splitBroadcastTarget(rest: string, courses: TeamCourse[]): CommandSplit {
  const parts = rest.split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  const known = courses.some((course) => String(course.id) === first || course.slug === first);
  const idLike = /^[1-9]\d{0,8}$/.test(first);
  const slugLike = isSlug(first);
  if (known && (idLike || slugLike)) {
    return { key: first, body: parts.slice(1).join(" ").trim() };
  }
  return { key: null, body: rest.trim() };
}

function sameChat(id: number | undefined, supportChatId: string): boolean {
  return Number.isSafeInteger(id) && String(id) === supportChatId;
}

function photoFileIdOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (!id || id.length > 128 || /\s/.test(id)) return null;
  return id;
}

/** Telegram lists sizes ascending. The last large file_id is the one sendPhoto can reuse. */
export function largestPhotoFileId(
  message: { photo?: Array<{ file_id?: unknown; file_size?: unknown }> } | undefined,
): string | null {
  const photos = message?.photo;
  if (!Array.isArray(photos)) return null;
  let best: { id: string; size: number } | null = null;
  for (const item of photos) {
    const id = photoFileIdOf(item?.file_id);
    if (!id) continue;
    const size = typeof item?.file_size === "number" && item.file_size > 0 ? item.file_size : 0;
    if (!best || size >= best.size) best = { id, size };
  }
  return best?.id ?? null;
}

export function readTeamEvent(
  update: unknown,
  supportChatId: string,
  botUsername: string,
): TeamEvent | "ignore" | null {
  if (!update || typeof update !== "object" || !supportChatId) return null;
  const envelope = update as {
    message?: {
      chat?: { id?: number; type?: string };
      from?: { id?: number; is_bot?: boolean };
      text?: unknown;
      caption?: unknown;
      message_id?: number;
      reply_to_message?: {
        message_id?: number;
        photo?: Array<{ file_id?: unknown; file_size?: unknown }>;
      };
      photo?: Array<{ file_id?: unknown; file_size?: unknown }>;
    };
    callback_query?: {
      id?: unknown;
      data?: unknown;
      from?: { id?: number; is_bot?: boolean };
      message?: { message_id?: number; chat?: { id?: number } };
    };
  };
  const callback = envelope.callback_query;
  if (callback) {
    if (!sameChat(callback.message?.chat?.id, supportChatId)) return null;
    const callbackUserId = callback.from?.id;
    if (callback.from?.is_bot || typeof callbackUserId !== "number" || !Number.isSafeInteger(callbackUserId) || callbackUserId <= 0) {
      return "ignore";
    }
    if (typeof callback.id !== "string" || typeof callback.data !== "string") return "ignore";
    const messageId = callback.message?.message_id;
    return {
      type: "callback",
      chatId: supportChatId,
      userId: String(callbackUserId),
      queryId: callback.id,
      data: callback.data,
      messageId: Number.isSafeInteger(messageId) && messageId! > 0 ? messageId! : null,
    };
  }
  const message = envelope.message;
  if (!message?.chat || !sameChat(message.chat.id, supportChatId)) return null;
  const userId = message.from?.id;
  if (message.from?.is_bot || typeof userId !== "number" || !Number.isSafeInteger(userId) || userId <= 0) {
    return "ignore";
  }
  const text = typeof message.text === "string" ? message.text.trim() : "";
  const caption = typeof message.caption === "string" ? message.caption.trim() : "";
  const body = text || caption;
  const commandText = text.startsWith("/all") ? text : caption.startsWith("/all") ? caption : "";
  if (commandText) {
    const parsed = parseAllCommand(commandText, botUsername);
    if (parsed === "foreign" || !parsed) return "ignore";
    const ownPhoto = largestPhotoFileId(message);
    const repliedPhoto = text.startsWith("/all") ? largestPhotoFileId(message.reply_to_message) : null;
    return {
      type: "command",
      chatId: supportChatId,
      userId: String(userId),
      text: commandText,
      botUsername,
      photoFileId: ownPhoto ?? repliedPhoto,
    };
  }
  const replied = message.reply_to_message?.message_id;
  if (Number.isSafeInteger(replied) && replied! > 0 && body && !body.startsWith("/")) {
    return {
      type: "reply",
      chatId: supportChatId,
      userId: String(userId),
      text: body,
      replyToMessageId: replied!,
    };
  }
  return "ignore";
}

function buttons(id: number): TelegramReply["replyMarkup"] {
  return {
    inline_keyboard: [[
      { text: "✅ Надіслати", callback_data: `tb:ok:${id}` },
      { text: "✖ Скасувати", callback_data: `tb:no:${id}` },
    ]],
  };
}

function edit(chatId: string, messageId: number | null, text: string): TelegramReply {
  return {
    chatId,
    text,
    disablePreview: true,
    ...(messageId ? { editMessageId: messageId, replyMarkup: { inline_keyboard: [] } } : {}),
  };
}

async function deliver(deps: TeamDeps, reply: TelegramReply): Promise<{ ok: boolean; messageId?: number }> {
  const { continuation, ...head } = reply;
  try {
    const first = await deps.send(head);
    if (!first.ok) return first;
    let messageId = first.messageId;
    for (const next of continuation ?? []) {
      const sent = await deps.send(next);
      if (!sent.ok) return sent;
      messageId = sent.messageId ?? messageId;
    }
    return { ok: true, messageId };
  } catch (error) {
    console.error("team chat send", error);
    return { ok: false };
  }
}

/** Photo and caption together when the text fits. Otherwise the photo, then the full text. */
export function attachBroadcastPhoto(reply: TelegramReply, photoFileId: string | null): TelegramReply {
  const photo = photoFileId?.trim() || "";
  if (!photo) return reply;
  const { continuation: _nested, ...head } = reply;
  if (head.text.length <= TELEGRAM_CAPTION_LIMIT) {
    return { ...head, photoFileId: photo };
  }
  return {
    ...head,
    text: "",
    photoFileId: photo,
    replyMarkup: undefined,
    continuation: [{ ...head }],
  };
}

function pickCourse(courses: TeamCourse[], key: string | null): TeamCourse | "several" | "none" | "missing" {
  const visible = courses.filter((course) => course.status !== "archived");
  if (key) {
    const found = visible.find((course) => String(course.id) === key || course.slug === key);
    return found ?? "missing";
  }
  const active = visible.filter((course) => course.status === "active");
  if (active.length === 1) return active[0]!;
  if (active.length === 0) return "none";
  return "several";
}

async function show(
  deps: TeamDeps,
  reply: TelegramReply,
): Promise<TelegramReply | null> {
  const sent = await deliver(deps, reply);
  if (sent.ok) return null;
  return { chatId: reply.chatId, text: "Не вдалося надіслати повідомлення в групу.", disablePreview: true };
}

export async function handleTeamChat(event: TeamEvent, deps: TeamDeps): Promise<TelegramReply | null> {
  if (event.type === "callback" && deps.acknowledge) {
    try {
      await deps.acknowledge(event.queryId);
    } catch (error) {
      console.error("team chat callback", error);
    }
  }
  let allowed = false;
  try {
    allowed = await deps.authorize(event.userId);
  } catch (error) {
    console.error("team chat auth", error);
    return null;
  }
  if (!allowed) return null;
  if (event.type === "command") return onCommand(event, deps);
  if (event.type === "callback") return onCallback(event, deps);
  return onReply(event, deps);
}

async function onCommand(
  event: Extract<TeamEvent, { type: "command" }>,
  deps: TeamDeps,
): Promise<TelegramReply | null> {
  const parsed = parseAllCommand(event.text, event.botUsername);
  if (!parsed || parsed === "foreign") return null;
  const courses = await deps.courses();
  const split = splitBroadcastTarget(parsed.rest, courses);
  const picked = pickCourse(courses, split.key);
  if (picked === "several") {
    const active = courses.filter((course) => course.status === "active");
    return show(deps, { chatId: event.chatId, text: severalMarathonsText(active), disablePreview: true });
  }
  if (picked === "none") {
    return show(deps, {
      chatId: event.chatId,
      text: "Немає активного денного марафону. Напишіть /all <id або slug> текст.",
      disablePreview: true,
    });
  }
  if (picked === "missing") {
    return show(deps, { chatId: event.chatId, text: "Немає такого денного марафону.", disablePreview: true });
  }
  const body = split.body.slice(0, BODY_LIMIT).trim();
  if (!body && !event.photoFileId) {
    return show(deps, { chatId: event.chatId, text: "Додайте текст після команди.", disablePreview: true });
  }
  const chats = await deps.recipients(picked.id);
  const id = await deps.saveDraft({
    marathonId: picked.id,
    authorTgId: event.userId,
    body,
    photoFileId: event.photoFileId,
    previewChatId: event.chatId,
    recipientCount: chats.length,
  });
  const preview = broadcastPreview({ title: picked.title, body, count: chats.length });
  const sent = await deliver(deps, attachBroadcastPhoto({
    chatId: event.chatId,
    text: preview,
    disablePreview: true,
    replyMarkup: buttons(id),
  }, event.photoFileId));
  if (!sent.ok) {
    await deps.markCancelled(id);
    return { chatId: event.chatId, text: "Не вдалося показати чернетку.", disablePreview: true };
  }
  if (sent.messageId) await deps.rememberPreview(id, sent.messageId);
  return null;
}

async function onCallback(
  event: Extract<TeamEvent, { type: "callback" }>,
  deps: TeamDeps,
): Promise<TelegramReply | null> {
  const action = parseBroadcastCallback(event.data);
  if (!action) return null;
  const draft = await deps.loadDraft(action.id);
  if (!draft) return null;
  const messageId = draft.previewMessageId ?? event.messageId;
  if (action.action === "cancel") {
    if (draft.status === "sent") {
      return show(deps, edit(draft.previewChatId, messageId, `Надіслано ${draft.sentCount}`));
    }
    await deps.markCancelled(draft.id);
    return show(deps, edit(draft.previewChatId, messageId, "Скасовано"));
  }
  if (draft.status === "sent") {
    return show(deps, edit(draft.previewChatId, messageId, `Надіслано ${draft.sentCount}`));
  }
  if (draft.status === "cancelled") {
    return show(deps, edit(draft.previewChatId, messageId, "Скасовано"));
  }
  if (draft.expired) {
    await deps.markCancelled(draft.id);
    return show(deps, edit(draft.previewChatId, messageId, "Чернетка прострочена."));
  }
  const won = await deps.markSent(draft.id, 0);
  if (!won) {
    const again = await deps.loadDraft(draft.id);
    if (again?.status === "sent") {
      return show(deps, edit(again.previewChatId, again.previewMessageId ?? messageId, `Надіслано ${again.sentCount}`));
    }
    return null;
  }
  try {
    const chats = await deps.recipients(draft.marathonId);
    if (chats.length > 0) {
      await deps.enqueue({
        marathonId: draft.marathonId,
        chats,
        body: draft.body,
        photoFileId: draft.photoFileId,
      });
      deps.scheduleDrain();
    }
    await deps.setSentCount(draft.id, chats.length);
    return show(deps, edit(draft.previewChatId, messageId, `Надіслано ${chats.length}`));
  } catch (error) {
    console.error("team broadcast enqueue", error);
    await deps.revertToDraft(draft.id);
    return show(deps, {
      chatId: draft.previewChatId,
      text: "Не вдалося поставити розсилку в чергу. Спробуйте ще раз.",
      disablePreview: true,
    });
  }
}

async function onReply(
  event: Extract<TeamEvent, { type: "reply" }>,
  deps: TeamDeps,
): Promise<TelegramReply | null> {
  const ticket = await deps.findTicket(event.replyToMessageId);
  if (!ticket) return null;
  const text = event.text.slice(0, 4000).trim();
  if (!text) return null;
  const result = await deps.replyTicket(ticket.id, text);
  const note = result === "ok"
    ? "Відповідь надіслано."
    : "Не вдалося надіслати відповідь.";
  return show(deps, { chatId: event.chatId, text: note, disablePreview: true });
}

export const BROADCAST_DRAFT_MS = DRAFT_MS;

/** What one participant receives. `system` so quiet hours and the outbox throttle apply. */
export function studentBroadcastReply(chatId: string, body: string): TelegramReply {
  return {
    chatId,
    text: body,
    disablePreview: true,
    trigger: "system",
    schedule: { dayNumber: 0, kind: BROADCAST_KIND },
  };
}

/** One sendPhoto when the caption fits. A longer text is a second outbox row, after the photo. */
export function studentBroadcastReplies(
  chatId: string,
  body: string,
  photoFileId?: string | null,
): TelegramReply[] {
  const text = body.trim();
  const photo = photoFileId?.trim() || "";
  if (!photo) return [studentBroadcastReply(chatId, text)];
  if (text.length <= TELEGRAM_CAPTION_LIMIT) {
    return [{ ...studentBroadcastReply(chatId, text), photoFileId: photo }];
  }
  return [
    { ...studentBroadcastReply(chatId, ""), photoFileId: photo },
    studentBroadcastReply(chatId, text),
  ];
}
