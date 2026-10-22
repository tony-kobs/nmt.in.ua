import assert from "node:assert/strict";
import test from "node:test";

import { COPY_DEFAULTS } from "@/modules/marathons/daily/copy";
import {
  intakeDecision,
  parseTicketFilter,
  publicChatNotice,
  readPrivateNote,
  readSupportChatId,
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
