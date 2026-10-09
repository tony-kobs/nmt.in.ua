import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "@/app/api/telegram/webhook/route";

test("webhook acknowledges malformed private callbacks before sending a safe reply", async () => {
  const saved = { token: process.env.TELEGRAM_BOT_TOKEN, username: process.env.TELEGRAM_BOT_USERNAME, secret: process.env.TELEGRAM_WEBHOOK_SECRET, fetch: globalThis.fetch };
  process.env.TELEGRAM_BOT_TOKEN = "123:test";
  process.env.TELEGRAM_BOT_USERNAME = "test_bot";
  process.env.TELEGRAM_WEBHOOK_SECRET = "test-secret";
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response('{"ok":true,"result":{"message_id":1}}', { status: 200 });
  };
  try {
    const request = new Request("https://nmt.in.ua/api/telegram/webhook", {
      method: "POST", headers: { "x-telegram-bot-api-secret-token": "test-secret" },
      body: JSON.stringify({ callback_query: { id: "query123", from: { id: 123 }, message: { chat: { id: 123, type: "private" } }, data: "d:42" } }),
    });
    assert.equal((await POST(request)).status, 200);
    assert.match(calls[0].url, /\/answerCallbackQuery$/);
    assert.deepEqual(calls[0].body, { callback_query_id: "query123" });
    assert.match(calls[1].url, /\/sendMessage$/);
    assert.match(String(calls[1].body.text), /недійсне/);
    assert.doesNotMatch(String(calls[1].body.text), /42|SQL|test-secret/);
  } finally {
    globalThis.fetch = saved.fetch;
    for (const [name, value] of [["TELEGRAM_BOT_TOKEN", saved.token], ["TELEGRAM_BOT_USERNAME", saved.username], ["TELEGRAM_WEBHOOK_SECRET", saved.secret]]) {
      if (value === undefined) delete process.env[name!]; else process.env[name!] = value;
    }
  }
});

test("webhook reports acknowledgement, message delivery and JSON failures without leaking details", async () => {
  const saved = { token: process.env.TELEGRAM_BOT_TOKEN, username: process.env.TELEGRAM_BOT_USERNAME, secret: process.env.TELEGRAM_WEBHOOK_SECRET, fetch: globalThis.fetch, error: console.error };
  process.env.TELEGRAM_BOT_TOKEN = "123:test";
  process.env.TELEGRAM_BOT_USERNAME = "test_bot";
  process.env.TELEGRAM_WEBHOOK_SECRET = "test-secret";
  console.error = () => {};
  const body = JSON.stringify({ callback_query: { id: "query123", from: { id: 123 }, message: { chat: { id: 123, type: "private" } }, data: "d:42" } });
  const request = (payload: string) => new Request("https://nmt.in.ua/api/telegram/webhook", {
    method: "POST", headers: { "x-telegram-bot-api-secret-token": "test-secret" }, body: payload,
  });
  try {
    for (const kind of ["ack-http", "ack-network", "send-rejected", "send-unknown"]) {
      const calls: string[] = [];
      globalThis.fetch = async (url) => {
        calls.push(String(url).split("/").at(-1)!);
        if (calls.length === 1) {
          if (kind === "ack-network") throw new Error("private token");
          return new Response('{"ok":true}', { status: kind === "ack-http" ? 500 : 200 });
        }
        return kind === "send-rejected"
          ? new Response('{"ok":false,"error_code":403,"description":"private token"}', { status: 403 })
          : new Response("not JSON");
      };
      const response = await POST(request(body));
      assert.equal(response.status, 200);
      assert.equal(await response.text(), "");
      assert.deepEqual(calls, kind.startsWith("ack") ? ["answerCallbackQuery"] : ["answerCallbackQuery", "sendMessage"]);
    }
    globalThis.fetch = async () => { assert.fail("must not send malformed updates"); };
    assert.equal((await POST(request("{"))).status, 400);
    for (const payload of ["null", "[]", '"bad"', '{"message":{}}', '{"callback_query":{}}']) {
      assert.equal((await POST(request(payload))).status, 200);
    }
  } finally {
    globalThis.fetch = saved.fetch;
    console.error = saved.error;
    for (const [name, value] of [["TELEGRAM_BOT_TOKEN", saved.token], ["TELEGRAM_BOT_USERNAME", saved.username], ["TELEGRAM_WEBHOOK_SECRET", saved.secret]]) {
      if (value === undefined) delete process.env[name!]; else process.env[name!] = value;
    }
  }
});
