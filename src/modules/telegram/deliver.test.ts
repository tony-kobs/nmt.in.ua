import assert from "node:assert/strict";
import test from "node:test";
import { deliverTelegramReplies } from "./deliver";

test("a rendered formula is sent as a photo and a failed render falls back to the site", async () => {
  const calls: string[] = [];
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const sent = await deliverTelegramReplies([
    {
      chatId: "7",
      text: "",
      formulaTex: "x^2",
      formulaDisplay: true,
      replyMarkup: { inline_keyboard: [[{ text: "1", callback_data: "mh:z:opaqueToken01" }]] },
      siteUrl: "https://nmt.in.ua/marathon/math-5/day/1",
      siteLabel: "Відкрити на сайті",
    },
  ], "token", {
    sleep: async () => {},
    renderFormula: async () => png,
    request: async (url, init) => {
      calls.push(String(url));
      assert.match(String(init?.body), /formula\.png|FormData|object/i);
      return new Response('{"ok":true,"result":{"message_id":3}}');
    },
  });
  assert.equal(sent.sent, 1);
  assert.match(calls[0] ?? "", /sendPhoto$/);

  const fallbackCalls: string[] = [];
  const fallback = await deliverTelegramReplies([
    {
      chatId: "7",
      text: "",
      formulaTex: "\\bad",
      siteUrl: "https://nmt.in.ua/marathon/math-5/day/1",
      siteLabel: "Відкрити на сайті",
    },
  ], "token", {
    sleep: async () => {},
    renderFormula: async () => null,
    request: async (url, init) => {
      fallbackCalls.push(String(url));
      const body = JSON.parse(String(init?.body)) as { text?: string; reply_markup?: { inline_keyboard?: Array<Array<{ url?: string }>> } };
      assert.match(body.text ?? "", /nmt\.in\.ua\/marathon\/math-5\/day\/1/);
      assert.equal(body.reply_markup?.inline_keyboard?.[0]?.[0]?.url, "https://nmt.in.ua/marathon/math-5/day/1");
      return new Response('{"ok":true,"result":{"message_id":4}}');
    },
  });
  assert.equal(fallback.sent, 1);
  assert.match(fallbackCalls[0] ?? "", /sendMessage$/);
  assert.equal(fallbackCalls.some((url) => url.includes("sendPhoto")), false);
});
