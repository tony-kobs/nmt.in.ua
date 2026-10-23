import assert from "node:assert/strict";
import test from "node:test";

import { COPY_DEFAULTS, renderResolved } from "@/modules/marathons/daily/copy";
import {
  composeStudentReply,
  intakeDecision,
  parseTicketFilter,
  publicChatNotice,
  readPrivateNote,
  readSupportChatId,
  readSupportReplyPress,
  supportMigrationNotice,
  supportQuestionQuote,
  teamFollowupHtml,
  teamTicketHtml,
} from "./text";

const note = (message: Record<string, unknown>) => readPrivateNote({ message });

test("the next private text or photo caption is a ticket, and navigation is not", () => {
  assert.equal(intakeDecision({ body: "не відкривається день", navigation: false }, true), "ticket");
  assert.equal(intakeDecision({ body: "❓ Допомога", navigation: true }, true), "cancel");
  assert.equal(intakeDecision({ body: "/menu", navigation: true }, true), "cancel");
  assert.equal(intakeDecision({ body: null, navigation: false }, true), "ignore");
  assert.equal(intakeDecision({ body: "привіт", navigation: false }, false), "ignore");

  const caption = note({
    chat: { id: 7, type: "private" },
    from: { id: 7 },
    photo: [{ file_id: "a" }],
    caption: "  ось умова  ",
  });
  assert.equal(caption?.body, "ось умова");
  assert.equal(caption?.navigation, false);

  const photo = note({
    chat: { id: 7, type: "private" },
    from: { id: 7 },
    photo: [{ file_id: "a" }],
  });
  assert.equal(photo?.body, "Фото");
  assert.equal(photo?.kind, "photo");
  assert.equal(photo?.replyToMessageId, null);
  assert.equal(intakeDecision(photo!, true), "ticket");

  const help = note({ chat: { id: 7, type: "private" }, from: { id: 7 }, text: "❓ Допомога" });
  assert.equal(help?.navigation, true);
  const command = note({ chat: { id: 7, type: "private" }, from: { id: 7 }, text: "/stop" });
  assert.equal(command?.navigation, true);
  assert.equal(note({ chat: { id: -5, type: "group" }, from: { id: 7 }, text: "привіт" }), null);
  assert.equal(note({ chat: { id: 8, type: "private" }, from: { id: 7 }, text: "привіт" }), null);
});

test("the team message names the person, marathon and day, and skips a missing chat id", () => {
  const text = teamTicketHtml({
    id: 4,
    displayName: "Іра <b>",
    marathonTitle: "Весна",
    dayNumber: 2,
    chatId: "7",
    body: "день <3",
  });
  assert.match(text, /Звернення #4/);
  assert.match(text, /Іра &lt;b&gt;/);
  assert.match(text, /Марафон: Весна/);
  assert.match(text, /День: 2/);
  assert.match(text, /день &lt;3/);
  assert.equal(readSupportChatId(undefined), null);
  assert.equal(readSupportChatId("  "), null);
  assert.equal(readSupportChatId("chat"), null);
  assert.equal(readSupportChatId("-100123"), "-100123");
});

test("the public chat line is shown only when the marathon has a url", () => {
  assert.equal(publicChatNotice("", undefined), null);
  assert.equal(publicChatNotice("   ", { bot_help_chat: "чат {link}" }), null);
  assert.equal(
    publicChatNotice("https://t.me/nmt", undefined),
    COPY_DEFAULTS.bot_help_chat.replace("{link}", "https://t.me/nmt"),
  );
  assert.equal(publicChatNotice("https://t.me/nmt", { bot_help_chat: "Наш чат: {link}" }), "Наш чат: https://t.me/nmt");
  assert.equal(parseTicketFilter("closed"), "closed");
  assert.equal(parseTicketFilter("nope"), "all");
  assert.equal(parseTicketFilter(undefined), "all");
});

test("the admin banner keeps the migrated chat id until the env uses it", () => {
  assert.equal(supportMigrationNotice(null, undefined), null);
  assert.equal(supportMigrationNotice("chat", "-1001"), null);
  assert.equal(supportMigrationNotice("-1009876543210", undefined), "-1009876543210");
  assert.equal(supportMigrationNotice("-1009876543210", "-2001"), "-1009876543210");
  assert.equal(supportMigrationNotice("-1009876543210", "-1009876543210"), null);
});

test("a student reply quotes the question and keeps a follow-up button", () => {
  const message = composeStudentReply({
    ticketId: 4,
    question: "день <3",
    photo: false,
    answer: "Перевірте посилання",
    copy: null,
  });
  assert.match(message.text, /Відповідь на ваше звернення #4/);
  assert.match(message.text, /<blockquote>день &lt;3<\/blockquote>/);
  assert.match(message.text, /Перевірте посилання/);
  assert.equal(message.button.callback_data, "sp:r:4");
  assert.equal(message.button.text, "✍️ Відповісти");
  assert.equal(message.text.includes("<3"), false);

  const photo = composeStudentReply({
    ticketId: 9,
    question: "Фото",
    photo: true,
    answer: "ок",
    copy: {
      bot_support_reply_header: "Відповідь {id}",
      bot_support_reply_photo: "(знімок)",
      bot_support_reply_btn: "Ще",
    },
  });
  assert.match(photo.text, /^Відповідь 9/);
  assert.match(photo.text, /<blockquote>\(знімок\)<\/blockquote>/);
  assert.equal(photo.button.text, "Ще");

  const caption = supportQuestionQuote({ body: "ось умова", photo: true, photoLabel: "[фото]" });
  assert.equal(caption, "ось умова");
  const typed = supportQuestionQuote({ body: "Фото", photo: false, photoLabel: "[фото]" });
  assert.equal(typed, "Фото");

  const long = composeStudentReply({
    ticketId: 1,
    question: "а".repeat(500),
    photo: false,
    answer: "&".repeat(4000),
    copy: null,
  });
  assert.ok(long.text.length <= 4096);
  assert.match(long.text, /<blockquote>/);
  assert.match(long.text, /…/);

  assert.equal(readSupportReplyPress({
    callback_query: {
      id: "q1",
      data: "sp:r:4",
      from: { id: 7 },
      message: { chat: { id: 7, type: "private" } },
    },
  })?.ticketId, 4);
  assert.equal(readSupportReplyPress({
    callback_query: {
      id: "q1",
      data: "sp:r:4",
      from: { id: 7 },
      message: { chat: { id: -100, type: "supergroup" } },
    },
  }), null);
  assert.match(renderResolved("bot_support_follow_ask", undefined, { id: 3 }), /#3/);
  assert.match(teamFollowupHtml({ id: 4, displayName: "Іра <b>", body: "ще раз" }), /Продовження #4/);
  assert.match(teamFollowupHtml({ id: 4, displayName: "Іра <b>", body: "ще раз" }), /Іра &lt;b&gt;/);
});
