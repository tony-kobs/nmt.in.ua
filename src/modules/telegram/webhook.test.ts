import assert from "node:assert/strict";
import { test } from "node:test";
import { UNLINK_NOTICE } from "./unlink";
import { handleTelegramUpdate, parseTelegramStart, parseTelegramUnlink, verifyTelegramWebhookSecret } from "./webhook";

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
  const reply = await handleTelegramUpdate(start("/start"), {
    consume: async () => { calls++; return true; },
    getProfile: async () => ({ status: "error", code: "notLinked" }),
  });
  assert.equal(calls, 0);
  assert.match(reply!.text, /nmt\.in\.ua/);
  assert.equal(parseTelegramStart(start("/start token", "group")), null);
});

test("/stop and «Відв'язати» unlink the signed-in account; a pause button does not", async () => {
  const seen: number[] = [];
  const profile = {
    status: "success" as const,
    profile: { accountId: 1, userId: 7, role: "student" as const, displayName: "Учень", linkedAt: null },
  };
  const reply = await handleTelegramUpdate(start("/stop@nmt_bot"), {
    consume: async () => true,
    getProfile: async () => profile,
    unlink: async (userId) => { seen.push(userId); },
  });
  const label = await handleTelegramUpdate(start("Відв'язати"), {
    consume: async () => true,
    getProfile: async () => profile,
    unlink: async (userId) => { seen.push(userId); },
  });
  const typographic = parseTelegramUnlink(start("Відв’язати Telegram"));
  assert.equal(reply?.text, UNLINK_NOTICE);
  assert.equal(label?.text, UNLINK_NOTICE);
  assert.deepEqual(seen, [7, 7]);
  assert.equal(typographic?.userId, "123");
  assert.equal(parseTelegramUnlink(start("/stop extra")), null);
  assert.equal(parseTelegramUnlink(start("/stop", "group")), null);
  assert.equal(parseTelegramUnlink({ callback_query: { data: "mh:stop" } }), null);
  const missing = await handleTelegramUpdate(start("/stop"), {
    consume: async () => true,
    getProfile: async () => ({ status: "error", code: "notLinked" }),
    unlink: async () => { seen.push(0); },
  });
  assert.match(missing!.text, /не прив/);
  assert.deepEqual(seen, [7, 7]);
});

test("a survey answer is taken, and /menu is left for the marathon menu", async () => {
  const seen: string[] = [];
  const reply = await handleTelegramUpdate(start("коротші пояснення"), {
    consume: async () => true,
    survey: {
      takeText: async (chatId, body) => {
        seen.push(`${chatId}:${body}`);
        return { text: "Порадили б марафон знайомим?", buttons: [{ text: "Так", data: "mh:sv:y" }] };
      },
    },
  });
  assert.deepEqual(seen, ["123:коротші пояснення"]);
  assert.equal(reply?.text, "Порадили б марафон знайомим?");
  assert.equal(reply?.replyMarkup?.inline_keyboard[0]?.[0]?.callback_data, "mh:sv:y");
  const menu = await handleTelegramUpdate(start("/menu"), {
    consume: async () => true,
    marathon: async () => ({ chatId: "123", text: "меню" }),
    survey: {
      takeText: async () => {
        seen.push("menu");
        return { text: "ні", buttons: [] };
      },
    },
  });
  assert.equal(menu?.text, "меню");
  assert.deepEqual(seen, ["123:коротші пояснення"]);
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
