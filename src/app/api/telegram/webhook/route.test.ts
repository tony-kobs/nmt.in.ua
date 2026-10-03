import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "./route";

const validUpdate = JSON.stringify({
  message: { chat: { id: 123, type: "private" }, from: { id: 123 }, text: "/start" },
});

test("webhook rejects missing configuration and unauthenticated requests", async () => {
  const previous = {
    token: process.env.TELEGRAM_BOT_TOKEN,
    username: process.env.TELEGRAM_BOT_USERNAME,
    secret: process.env.TELEGRAM_WEBHOOK_SECRET,
  };
  try {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_USERNAME;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    assert.equal((await POST(new Request("https://example.test/api/telegram/webhook", { method: "POST", body: validUpdate }))).status, 503);
    process.env.TELEGRAM_BOT_TOKEN = "private-bot-token";
    process.env.TELEGRAM_BOT_USERNAME = "example_bot";
    process.env.TELEGRAM_WEBHOOK_SECRET = "private-webhook-secret";
    const rejected = await POST(new Request("https://example.test/api/telegram/webhook", { method: "POST", body: validUpdate }));
    assert.equal(rejected.status, 401);
    assert.doesNotMatch(await rejected.text(), /private-bot-token|private-webhook-secret/);
    const headers = { "x-telegram-bot-api-secret-token": "private-webhook-secret" };
    assert.equal((await POST(new Request("https://example.test/api/telegram/webhook", {
      method: "POST", headers: { ...headers, "content-length": "65537" }, body: validUpdate,
    }))).status, 413);
    assert.equal((await POST(new Request("https://example.test/api/telegram/webhook", {
      method: "POST", headers, body: "x".repeat(65537),
    }))).status, 413);
  } finally {
    if (previous.token === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = previous.token;
    if (previous.username === undefined) delete process.env.TELEGRAM_BOT_USERNAME;
    else process.env.TELEGRAM_BOT_USERNAME = previous.username;
    if (previous.secret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
    else process.env.TELEGRAM_WEBHOOK_SECRET = previous.secret;
  }
});
