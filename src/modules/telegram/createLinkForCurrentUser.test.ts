import assert from "node:assert/strict";
import { test } from "node:test";
import { createLinkForCurrentUser } from "./createLinkForCurrentUser";
import { readTelegramConfig } from "./config";

test("link creation requires the existing authenticated session", async () => {
  let called = false;
  await assert.rejects(() => createLinkForCurrentUser({
    requireUser: async () => { throw new Error("unauthenticated"); },
    readConfig: () => { called = true; return { botToken: "secret", webhookSecret: "secret", botUsername: "example_bot" }; },
    createLink: async () => "unused",
  }), /unauthenticated/);
  assert.equal(called, false);
});

test("browser action result contains the deep link but no bot secret", async () => {
  const result = await createLinkForCurrentUser({
    requireUser: async () => ({ id: 7, role: "student", login: "student", displayName: "Student" }),
    readConfig: () => ({ botToken: "private-bot-token", webhookSecret: "private-webhook-secret", botUsername: "example_bot" }),
    createLink: async (userId, username) => {
      assert.equal(userId, 7);
      assert.equal(username, "example_bot");
      return "https://t.me/example_bot?start=one-time-token";
    },
  });
  assert.equal(result.status, "success");
  assert.doesNotMatch(JSON.stringify(result), /private-bot-token|private-webhook-secret/);
});

test("missing optional Telegram configuration safely disables account linking", async () => {
  const names = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_USERNAME", "TELEGRAM_WEBHOOK_SECRET"];
  const previous = names.map((name) => process.env[name]);
  let called = false;
  try {
    for (const name of names) delete process.env[name];
    assert.deepEqual(await createLinkForCurrentUser({
      requireUser: async () => ({ id: 7, role: "student", login: "student", displayName: "Student" }),
      readConfig: readTelegramConfig,
      createLink: async () => { called = true; return "unused"; },
    }), { status: "error" });
    assert.equal(called, false);
  } finally {
    names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name];
      else process.env[name] = previous[index];
    });
  }
});
