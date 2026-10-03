import assert from "node:assert/strict";
import { test } from "node:test";
import { handleTelegramUpdate, parseTelegramStart, verifyTelegramWebhookSecret } from "./webhook";

function start(text: string, type = "private") {
  return { message: { chat: { id: 123, type }, from: { id: 123, username: "student_user" }, text } };
}

test("webhook secret is required and compared safely", () => {
  assert.equal(verifyTelegramWebhookSecret(null, "secret"), false);
  assert.equal(verifyTelegramWebhookSecret("wrong", "secret"), false);
  assert.equal(verifyTelegramWebhookSecret("secret", "secret"), true);
});

test("/start without payload never consumes a link", async () => {
  let calls = 0;
  const reply = await handleTelegramUpdate(start("/start"), { consume: async () => { calls++; return true; } });
  assert.equal(calls, 0);
  assert.match(reply!.text, /nmt\.in\.ua/);
  assert.equal(parseTelegramStart(start("/start token", "group")), null);
});

test("/start payload links and invalid payload gets generic reply", async () => {
  const seen: string[] = [];
  const valid = await handleTelegramUpdate(start("/start abc"), { consume: async (token) => { seen.push(token); return true; } });
  const invalid = await handleTelegramUpdate(start("/start bad"), { consume: async () => false });
  assert.deepEqual(seen, ["abc"]);
  assert.match(valid!.text, /успішно/);
  assert.doesNotMatch(invalid!.text, /user|token|hash|database/i);
  assert.equal(await handleTelegramUpdate(start("/unknown")), null);
});
