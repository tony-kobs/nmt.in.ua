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

test("a telegram file id is sent as the photo, and a refusal falls back to the text", async () => {
  const methods: string[] = [];
  const bodies: string[] = [];
  const request = (async (url: string | URL, init?: RequestInit) => {
    const method = String(url).split("/").pop() ?? "";
    methods.push(method);
    bodies.push(typeof init?.body === "string" ? init.body : "");
    const ok = method === "sendMessage";
    return new Response(JSON.stringify(ok
      ? { ok: true, result: { message_id: 6 } }
      : { ok: false, error_code: 400, description: "Bad Request: wrong file identifier" }), {
      status: ok ? 200 : 400, headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const result = await deliverTelegramReplies([
    { chatId: "7", text: "Схема", photoFileId: "AgACAgIAAxkB-file" },
  ], "token", { request, sleep: async () => {}, now: () => 0 });
  assert.equal(result.sent, 1);
  assert.deepEqual(methods, ["sendPhoto", "sendMessage"]);
  assert.match(bodies[0] ?? "", /AgACAgIAAxkB-file/);
  assert.match(bodies[1] ?? "", /Схема/);
});

test("a message with both keyboards is sent once, with the inline buttons", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const sent = await deliverTelegramReplies([{
    chatId: "7",
    text: "Спростіть вираз",
    replyMarkup: { inline_keyboard: [
      [{ text: "А", callback_data: "mh:qa:1:2:1" }],
      [{ text: "Б", callback_data: "mh:qa:1:2:2" }],
      [{ text: "В", callback_data: "mh:qa:1:2:3" }],
      [{ text: "Г", callback_data: "mh:qa:1:2:4" }],
    ] },
    replyKeyboard: {
      keyboard: [[{ text: "📚 Мої завдання" }, { text: "📅 Сьогодні" }], [{ text: "🏠 Головне меню" }]],
      resize_keyboard: true,
      is_persistent: true,
    },
  }], "token", {
    sleep: async () => {},
    request: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return new Response(JSON.stringify({ ok: true, result: { message_id: calls.length } }));
    },
  });
  assert.equal(sent.sent, 1);
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /sendMessage$/);
  const markup = calls[0]!.body.reply_markup as {
    keyboard?: unknown;
    inline_keyboard?: Array<Array<{ text?: string; callback_data?: string }>>;
    remove_keyboard?: unknown;
  };
  assert.equal(markup.keyboard, undefined);
  assert.equal(markup.remove_keyboard, undefined);
  assert.deepEqual(markup.inline_keyboard?.map((row) => row[0]?.text), ["А", "Б", "В", "Г"]);
  assert.equal(markup.inline_keyboard?.[0]?.[0]?.callback_data, "mh:qa:1:2:1");
});

test("a task message removes the bottom menu and then keeps the answer buttons", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const sent = await deliverTelegramReplies([{
    chatId: "7",
    text: "Обчисліть: (|-8+3|+|-4|)/(3²-6).",
    hideReplyKeyboard: true,
    supersedeMessageId: 11,
    replyMarkup: { inline_keyboard: [
      [{ text: "А. 1", callback_data: "mh:qa:4:8:1" }],
      [{ text: "Б. 2", callback_data: "mh:qa:4:8:2" }],
      [{ text: "🏠 Головне меню", callback_data: "m:home" }],
    ] },
  }], "token", {
    sleep: async () => {},
    request: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 20 + calls.length } }));
    },
  });
  assert.equal(sent.sent, 1);
  assert.deepEqual(calls.map((call) => call.url.split("/").at(-1)), [
    "sendMessage",
    "editMessageReplyMarkup",
    "deleteMessage",
  ]);
  const sentMarkup = calls[0]?.body.reply_markup as { remove_keyboard?: boolean; inline_keyboard?: unknown };
  assert.equal(sentMarkup.remove_keyboard, true);
  assert.equal(sentMarkup.inline_keyboard, undefined);
  assert.match(String(calls[0]?.body.text), /Обчисліть/);
  const edited = calls[1]?.body.reply_markup as { inline_keyboard?: Array<Array<{ text?: string; callback_data?: string }>> };
  assert.deepEqual(edited.inline_keyboard?.map((row) => row[0]?.text), ["А. 1", "Б. 2", "🏠 Головне меню"]);
  assert.equal(edited.inline_keyboard?.[0]?.[0]?.callback_data, "mh:qa:4:8:1");
  assert.equal(calls[2]?.body.message_id, 11);
});

test("if the answer buttons cannot be attached, they go out as their own message", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  await deliverTelegramReplies([{
    chatId: "7",
    text: "Спростіть вираз",
    hideReplyKeyboard: true,
    replyMarkup: { inline_keyboard: [[{ text: "А", callback_data: "mh:a:1:2:1" }]] },
  }], "token", {
    sleep: async () => {},
    request: async (url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push({ url: String(url), body });
      const method = String(url).split("/").at(-1);
      if (method === "editMessageReplyMarkup") {
        return new Response(JSON.stringify({ ok: false, error_code: 400, description: "message can't be edited" }));
      }
      return new Response(JSON.stringify({ ok: true, result: { message_id: calls.length } }));
    },
  });
  assert.deepEqual(calls.map((call) => call.url.split("/").at(-1)), [
    "sendMessage",
    "editMessageReplyMarkup",
    "sendMessage",
  ]);
  assert.equal(calls[2]?.body.text, "Оберіть відповідь");
  const markup = calls[2]?.body.reply_markup as { inline_keyboard?: Array<Array<{ callback_data?: string }>>; remove_keyboard?: boolean };
  assert.equal(markup.remove_keyboard, undefined);
  assert.equal(markup.inline_keyboard?.[0]?.[0]?.callback_data, "mh:a:1:2:1");
  assert.equal(calls.filter((call) => String(call.body.text).includes("Спростіть")).length, 1);
});

test("an inline-only task message does not replace or remove the bottom menu", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  await deliverTelegramReplies([{
    chatId: "7",
    text: "Завдання",
    replyMarkup: { inline_keyboard: [[{ text: "А", callback_data: "mh:a:1:2:1" }], [{ text: "Б", callback_data: "mh:a:1:2:2" }]] },
  }], "token", {
    sleep: async () => {},
    request: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return new Response('{"ok":true,"result":{"message_id":4}}');
    },
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /sendMessage$/);
  const markup = calls[0]!.body.reply_markup as {
    inline_keyboard?: Array<Array<{ text?: string }>>;
    keyboard?: unknown;
    remove_keyboard?: unknown;
  };
  assert.deepEqual(markup.inline_keyboard?.map((row) => row[0]?.text), ["А", "Б"]);
  assert.equal(markup.keyboard, undefined);
  assert.equal(markup.remove_keyboard, undefined);
});
