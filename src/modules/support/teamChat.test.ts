import assert from "node:assert/strict";
import test from "node:test";

import { handleTelegramUpdate } from "@/modules/telegram/webhook";
import { serializeReply } from "@/modules/telegram/outbox";
import {
  broadcastPreview,
  handleTeamChat,
  largestPhotoFileId,
  parseAllCommand,
  parseBroadcastCallback,
  readTeamEvent,
  severalMarathonsText,
  splitBroadcastTarget,
  studentBroadcastReplies,
  studentBroadcastReply,
  type TeamCourse,
  type TeamDeps,
  type TeamDraft,
} from "./teamChat";

const SUPPORT = "-100555";
const BOT = "nmt_in_ua_bot";

const courses: TeamCourse[] = [
  { id: 3, slug: "vesna", title: "Весна", status: "active" },
  { id: 9, slug: "zima", title: "Зима", status: "finished" },
];

function group(text: string, from = 42) {
  return { message: { message_id: 10, chat: { id: Number(SUPPORT), type: "supergroup" }, from: { id: from }, text } };
}

function harness(overrides: Partial<TeamDeps> = {}) {
  const sent: Array<{ text: string; photo?: string; edit?: number; buttons?: string[] }> = [];
  const enqueued: Array<{ marathonId: number; chats: string[]; body: string; photoFileId: string | null }> = [];
  let drains = 0;
  let nextId = 7;
  const drafts = new Map<number, TeamDraft>();
  const deps: TeamDeps = {
    authorize: async () => true,
    courses: async () => courses,
    recipients: async () => ["100", "200"],
    saveDraft: async (input) => {
      const id = nextId;
      nextId += 1;
      drafts.set(id, {
        id,
        marathonId: input.marathonId,
        body: input.body,
        photoFileId: input.photoFileId,
        status: "draft",
        expired: false,
        previewChatId: input.previewChatId,
        previewMessageId: null,
        sentCount: 0,
      });
      return id;
    },
    rememberPreview: async (id, messageId) => {
      const draft = drafts.get(id);
      if (draft) draft.previewMessageId = messageId;
    },
    loadDraft: async (id) => drafts.get(id) ?? null,
    markSent: async (id, count) => {
      const draft = drafts.get(id);
      if (!draft || draft.status !== "draft" || draft.expired) return false;
      draft.status = "sent";
      draft.sentCount = count;
      return true;
    },
    setSentCount: async (id, count) => {
      const draft = drafts.get(id);
      if (draft) draft.sentCount = count;
    },
    markCancelled: async (id) => {
      const draft = drafts.get(id);
      if (!draft || draft.status !== "draft") return false;
      draft.status = "cancelled";
      return true;
    },
    revertToDraft: async (id) => {
      const draft = drafts.get(id);
      if (draft && draft.status === "sent") draft.status = "draft";
    },
    enqueue: async (input) => {
      enqueued.push(input);
    },
    send: async (reply) => {
      sent.push({
        text: reply.text,
        ...(reply.photoFileId ? { photo: reply.photoFileId } : {}),
        ...(reply.editMessageId ? { edit: reply.editMessageId } : {}),
        ...(reply.replyMarkup ? { buttons: reply.replyMarkup.inline_keyboard.flat().map((button) => button.text) } : {}),
      });
      return { ok: true, messageId: 77 };
    },
    scheduleDrain: () => {
      drains += 1;
    },
    findTicket: async () => null,
    replyTicket: async () => "ok",
    ...overrides,
  };
  return { deps, sent, enqueued, drafts, drains: () => drains };
}

test("commands accept a bare /all and /all@thisBot, and ignore another bot", () => {
  assert.deepEqual(parseAllCommand("/all Привіт усім", BOT), { rest: "Привіт усім" });
  assert.deepEqual(parseAllCommand(`/all@${BOT} vesna Привіт`, BOT), { rest: "vesna Привіт" });
  assert.equal(parseAllCommand("/all@OtherBot Привіт", BOT), "foreign");
  assert.equal(parseAllCommand("Привіт", BOT), null);
  assert.deepEqual(parseBroadcastCallback("tb:ok:15"), { action: "send", id: 15 });
  assert.deepEqual(parseBroadcastCallback("tb:no:15"), { action: "cancel", id: 15 });
  assert.equal(parseBroadcastCallback("mh:menu"), null);
  assert.deepEqual(splitBroadcastTarget("vesna Привіт", courses), { key: "vesna", body: "Привіт" });
  assert.deepEqual(splitBroadcastTarget("3 Привіт", courses), { key: "3", body: "Привіт" });
  assert.deepEqual(splitBroadcastTarget("Привіт усім", courses), { key: null, body: "Привіт усім" });
});

test("the support group keeps the leaderboard text as a broadcast preview", async () => {
  const box = harness();
  const event = readTeamEvent(group("/all Усім привіт"), SUPPORT, BOT);
  assert.equal(event && typeof event === "object" && event.type, "command");
  if (!event || event === "ignore") return;
  const reply = await handleTeamChat(event, box.deps);
  assert.equal(reply, null);
  assert.equal(box.sent.length, 1);
  assert.match(box.sent[0]!.text, /Марафон: Весна/);
  assert.match(box.sent[0]!.text, /Отримувачів: 2/);
  assert.match(box.sent[0]!.text, /Усім привіт/);
  assert.deepEqual(box.sent[0]!.buttons, ["✅ Надіслати", "✖ Скасувати"]);
  assert.equal(box.drafts.get(7)?.previewMessageId, 77);
  assert.equal(readTeamEvent(group("/all@OtherBot ні"), SUPPORT, BOT), "ignore");
  assert.equal(readTeamEvent({
    message: { chat: { id: 7, type: "private" }, from: { id: 7 }, text: "/all ні" },
  }, SUPPORT, BOT), null);
});

test("several active marathons ask for an id and do not save a draft", async () => {
  const box = harness();
  const event = readTeamEvent(group("/all без slug"), SUPPORT, BOT);
  if (!event || event === "ignore") throw new Error("command");
  const active: TeamCourse[] = [
    { id: 3, slug: "vesna", title: "Весна", status: "active" },
    { id: 4, slug: "osin", title: "Осінь", status: "active" },
  ];
  await handleTeamChat(event, { ...box.deps, courses: async () => active });
  assert.match(box.sent[0]!.text, /кілька/);
  assert.match(box.sent[0]!.text, /3 vesna — Весна/);
  assert.match(box.sent[0]!.text, /4 osin — Осінь/);
  assert.equal(box.drafts.size, 0);
  assert.equal(severalMarathonsText(active).includes("Осінь"), true);
});

test("an explicit slug addresses that marathon", async () => {
  const box = harness();
  const event = readTeamEvent(group("/all zima Повтор"), SUPPORT, BOT);
  if (!event || event === "ignore") throw new Error("command");
  await handleTeamChat(event, box.deps);
  assert.match(box.sent[0]!.text, /Марафон: Зима/);
  assert.match(box.sent[0]!.text, /Повтор/);
  assert.equal(box.drafts.get(7)?.marathonId, 9);
});

test("someone who is not a group admin and not a site admin is ignored", async () => {
  const box = harness({ authorize: async () => false });
  const event = readTeamEvent(group("/all Усім привіт", 99), SUPPORT, BOT);
  if (!event || event === "ignore") throw new Error("command");
  const reply = await handleTeamChat(event, box.deps);
  assert.equal(reply, null);
  assert.equal(box.sent.length, 0);
  assert.equal(box.drafts.size, 0);
});

test("confirm enqueues once with a system trigger and a second tap does not", async () => {
  const box = harness();
  const command = readTeamEvent(group("/all Усім привіт"), SUPPORT, BOT);
  if (!command || command === "ignore") throw new Error("command");
  await handleTeamChat(command, box.deps);
  const press = {
    type: "callback" as const,
    chatId: SUPPORT,
    userId: "42",
    queryId: "q1",
    data: "tb:ok:7",
    messageId: 77,
  };
  let acks = 0;
  const deps = { ...box.deps, acknowledge: async () => { acks += 1; } };
  await handleTeamChat(press, deps);
  await handleTeamChat(press, deps);
  assert.equal(acks, 2);
  assert.equal(box.enqueued.length, 1);
  assert.deepEqual(box.enqueued[0], { marathonId: 3, chats: ["100", "200"], body: "Усім привіт", photoFileId: null });
  assert.equal(box.drains(), 1);
  assert.equal(box.sent.filter((item) => item.text === "Надіслано 2").length, 2);
  const payload = JSON.parse(serializeReply(studentBroadcastReply("100", "Усім привіт")));
  assert.equal(payload.trigger, "system");
  assert.equal(payload.schedule.kind, "broadcast");
  assert.equal(payload.text, "Усім привіт");
  assert.equal(broadcastPreview({ title: "Весна", body: "Усім привіт", count: 2 }).includes("Усім привіт"), true);
});

test("an expired draft is not sent", async () => {
  const box = harness();
  box.drafts.set(8, {
    id: 8,
    marathonId: 3,
    body: "пізно",
    photoFileId: null,
    status: "draft",
    expired: true,
    previewChatId: SUPPORT,
    previewMessageId: 80,
    sentCount: 0,
  });
  await handleTeamChat({
    type: "callback",
    chatId: SUPPORT,
    userId: "42",
    queryId: "q2",
    data: "tb:ok:8",
    messageId: 80,
  }, box.deps);
  assert.equal(box.enqueued.length, 0);
  assert.equal(box.sent.at(-1)?.text, "Чернетка прострочена.");
  assert.equal(box.drafts.get(8)?.status, "cancelled");
});

test("cancel leaves the draft unsent", async () => {
  const box = harness();
  box.drafts.set(8, {
    id: 8,
    marathonId: 3,
    body: "ні",
    photoFileId: null,
    status: "draft",
    expired: false,
    previewChatId: SUPPORT,
    previewMessageId: 81,
    sentCount: 0,
  });
  await handleTeamChat({
    type: "callback",
    chatId: SUPPORT,
    userId: "42",
    queryId: "q3",
    data: "tb:no:8",
    messageId: 81,
  }, box.deps);
  await handleTeamChat({
    type: "callback",
    chatId: SUPPORT,
    userId: "42",
    queryId: "q4",
    data: "tb:no:8",
    messageId: 81,
  }, box.deps);
  assert.equal(box.enqueued.length, 0);
  assert.equal(box.drafts.get(8)?.status, "cancelled");
  assert.equal(box.sent.at(-1)?.text, "Скасовано");
});

test("a reply to a forwarded ticket reaches the student, and a stranger does not", async () => {
  const replies: Array<{ id: number; text: string }> = [];
  const box = harness({
    findTicket: async (messageId) => messageId === 55 ? { id: 4 } : null,
    replyTicket: async (id, text) => {
      replies.push({ id, text });
      return "ok";
    },
  });
  const event = readTeamEvent({
    message: {
      message_id: 90,
      chat: { id: Number(SUPPORT), type: "supergroup" },
      from: { id: 42 },
      text: "Перевір день 2",
      reply_to_message: { message_id: 55 },
    },
  }, SUPPORT, BOT);
  if (!event || event === "ignore") throw new Error("reply");
  await handleTeamChat(event, box.deps);
  assert.deepEqual(replies, [{ id: 4, text: "Перевір день 2" }]);
  assert.equal(box.sent.at(-1)?.text, "Відповідь надіслано.");
  const stranger = harness({
    authorize: async () => false,
    findTicket: async () => { throw new Error("must not look up"); },
  });
  await handleTeamChat(event, stranger.deps);
  assert.equal(stranger.sent.length, 0);
});

test("a photo caption and a reply to a photo become one broadcast with that file", async () => {
  const caption = readTeamEvent({
    message: {
      message_id: 11,
      chat: { id: Number(SUPPORT), type: "supergroup" },
      from: { id: 42 },
      caption: "/all Дивіться схему",
      photo: [
        { file_id: "small", file_size: 20 },
        { file_id: "AgACAgIAAxkB-large", file_size: 800 },
      ],
    },
  }, SUPPORT, BOT);
  assert.equal(caption && typeof caption === "object" && caption.type, "command");
  if (!caption || caption === "ignore" || caption.type !== "command") throw new Error("caption");
  assert.equal(caption.photoFileId, "AgACAgIAAxkB-large");
  const box = harness();
  await handleTeamChat(caption, box.deps);
  assert.equal(box.sent[0]?.photo, "AgACAgIAAxkB-large");
  assert.match(box.sent[0]?.text ?? "", /Дивіться схему/);
  assert.equal(box.drafts.get(7)?.photoFileId, "AgACAgIAAxkB-large");

  const replied = readTeamEvent({
    message: {
      message_id: 12,
      chat: { id: Number(SUPPORT), type: "supergroup" },
      from: { id: 42 },
      text: "/all",
      reply_to_message: {
        message_id: 4,
        photo: [{ file_id: "reply-photo", file_size: 40 }],
      },
    },
  }, SUPPORT, BOT);
  if (!replied || replied === "ignore" || replied.type !== "command") throw new Error("reply photo");
  assert.equal(replied.photoFileId, "reply-photo");
  assert.equal(largestPhotoFileId(undefined), null);

  const long = `${"а".repeat(1100)}`;
  const parts = studentBroadcastReplies("100", long, "reply-photo");
  assert.equal(parts.length, 2);
  assert.equal(parts[0]?.photoFileId, "reply-photo");
  assert.equal(parts[0]?.text, "");
  assert.equal(parts[1]?.text, long);
  assert.equal(parts[1]?.photoFileId, undefined);
  assert.equal(parts[0]?.trigger, "system");
  const short = studentBroadcastReplies("100", "коротко", "reply-photo");
  assert.equal(short.length, 1);
  assert.equal(short[0]?.photoFileId, "reply-photo");
  assert.equal(short[0]?.text, "коротко");
});

test("confirming a photo draft queues sendPhoto, then the full text when the caption is too long", async () => {
  const box = harness();
  const long = "б".repeat(1100);
  const event = readTeamEvent({
    message: {
      message_id: 13,
      chat: { id: Number(SUPPORT), type: "supergroup" },
      from: { id: 42 },
      caption: `/all ${long}`,
      photo: [{ file_id: "day-photo", file_size: 10 }],
    },
  }, SUPPORT, BOT);
  if (!event || event === "ignore") throw new Error("command");
  await handleTeamChat(event, box.deps);
  assert.equal(box.sent[0]?.photo, "day-photo");
  assert.equal(box.sent[0]?.text, "");
  assert.match(box.sent[1]?.text ?? "", /б{20}/);
  assert.equal(box.sent[1]?.photo, undefined);
  await handleTeamChat({
    type: "callback",
    chatId: SUPPORT,
    userId: "42",
    queryId: "q-photo",
    data: "tb:ok:7",
    messageId: 77,
  }, box.deps);
  assert.equal(box.enqueued[0]?.photoFileId, "day-photo");
  assert.equal(box.enqueued[0]?.body.length, 1100);
  const queued = studentBroadcastReplies("100", box.enqueued[0]!.body, box.enqueued[0]!.photoFileId);
  assert.equal(queued[0]?.photoFileId, "day-photo");
  assert.equal(queued[1]?.text.length, 1100);
});

test("the webhook uses the team handler before the private menu", async () => {
  const reply = await handleTelegramUpdate(group("/all Усім привіт"), {
    consume: async () => false,
    teamChat: async () => ({ handled: true, reply: { chatId: SUPPORT, text: "чернетка" } }),
    getProfile: async () => { throw new Error("private menu"); },
  });
  assert.equal(reply?.text, "чернетка");
});
