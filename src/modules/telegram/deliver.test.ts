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

test("a failed formula keeps the caption and answer buttons and adds one site link", async () => {
  const calls: Array<{ url: string; body: string }> = [];
  const sent = await deliverTelegramReplies([
    {
      chatId: "7",
      text: "Математичні вирази · 1/10\n\nСпростіть вираз",
      formulaTex: "\\begin{cases}x\\end{cases}",
      formulaDisplay: true,
      replyMarkup: { inline_keyboard: [[{ text: "А", callback_data: "mh:qa:1:2:1" }]] },
      siteUrl: "https://nmt.in.ua/session/9",
      siteLabel: "Відкрити на сайті",
    },
  ], "token", {
    sleep: async () => {},
    renderFormula: async () => null,
    request: async (url, init) => {
      calls.push({ url: String(url), body: String(init?.body) });
      return new Response('{"ok":true,"result":{"message_id":8}}');
    },
  });
  assert.equal(sent.sent, 1);
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /sendMessage$/);
  const body = JSON.parse(calls[0]!.body) as {
    text?: string;
    reply_markup?: { inline_keyboard?: Array<Array<{ text?: string; url?: string; callback_data?: string }>> };
  };
  assert.match(body.text ?? "", /Спростіть вираз/);
  assert.equal(body.text?.trim() === ".", false);
  const rows = body.reply_markup?.inline_keyboard ?? [];
  assert.equal(rows[0]?.[0]?.callback_data, "mh:qa:1:2:1");
  assert.equal(rows.at(-1)?.[0]?.url, "https://nmt.in.ua/session/9");
  assert.equal(rows.filter((row) => row.some((button) => button.url)).length, 1);
});

test("a formula that cannot be drawn and has no site link is not sent as an empty message", async () => {
  let calls = 0;
  const sent = await deliverTelegramReplies([
    { chatId: "7", text: "", formulaTex: "\\bad" },
  ], "token", {
    sleep: async () => {},
    renderFormula: async () => null,
    request: async () => {
      calls += 1;
      return new Response('{"ok":true,"result":{"message_id":9}}');
    },
  });
  assert.equal(sent.sent, 1);
  assert.equal(calls, 0);
});

test("a photo Telegram refuses is resent as a text link instead of being dropped", async () => {
  const methods: string[] = [];
  const bodies: string[] = [];
  const request = (async (url: string | URL, init?: RequestInit) => {
    const method = String(url).split("/").pop() ?? "";
    methods.push(method);
    bodies.push(typeof init?.body === "string" ? init.body : "");
    const ok = method === "sendMessage";
    return new Response(JSON.stringify(ok
      ? { ok: true, result: { message_id: 5 } }
      : { ok: false, error_code: 400, description: "Bad Request: wrong file identifier/HTTP URL specified" }), {
      status: ok ? 200 : 400, headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const result = await deliverTelegramReplies([
    { chatId: "7", text: "Трикутник", photoUrl: "https://example.com/triangle.png" },
  ], "token", { request, sleep: async () => {}, now: () => 0 });
  assert.equal(result.sent, 1);
  assert.deepEqual(methods, ["sendPhoto", "sendMessage"]);
  assert.match(bodies[1]!, /triangle\.png/);
});
