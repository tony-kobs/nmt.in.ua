import assert from "node:assert/strict";
import test from "node:test";
import type { TelegramAccountResult } from "./account";
import { deliverTelegramReplies } from "./deliver";
import { shouldHoldForQuietHours } from "./preferences";
import { handleTelegramUpdate } from "./webhook";

const overnight = { quietStart: 22, quietEnd: 8 };
const student: TelegramAccountResult = {
  status: "success",
  profile: { accountId: 1, userId: 7, role: "student", displayName: "Іра", linkedAt: 1_800_000_000 },
};

const message = (text: string) => ({
  message: { chat: { id: 123, type: "private" }, from: { id: 123 }, text },
});
const press = (data: string) => ({
  callback_query: {
    id: "q1",
    data,
    from: { id: 123 },
    message: { message_id: 77, chat: { id: 123, type: "private" } },
  },
});

test("quiet hours hold system sends and never a user reply", () => {
  assert.equal(shouldHoldForQuietHours(overnight, 23, "system"), true);
  assert.equal(shouldHoldForQuietHours(overnight, 0, "system"), true);
  assert.equal(shouldHoldForQuietHours(overnight, 23, "user"), false);
  assert.equal(shouldHoldForQuietHours(overnight, 12, "system"), false);
  assert.equal(shouldHoldForQuietHours(null, 23, "system"), false);
  assert.equal(shouldHoldForQuietHours({ quietStart: 22, quietEnd: 22 }, 23, "system"), false);
});

test("menu, callbacks and commands are answered during quiet hours", async () => {
  assert.equal(shouldHoldForQuietHours(overnight, 23, "user"), false);
  const deps = {
    consume: async () => false,
    getProfile: async () => student,
    acknowledgeCallback: async () => {},
  };
  const homeText = await handleTelegramUpdate(message("🏠 Головне меню"), deps);
  const homeButton = await handleTelegramUpdate(press("m:home"), deps);
  const help = await handleTelegramUpdate(message("/help"), deps);
  assert.match(homeText?.text ?? "", /Вітаємо, Іра/);
  assert.match(homeButton?.text ?? "", /Вітаємо, Іра/);
  assert.match(help?.text ?? "", /Допомога/);
  assert.equal(homeText?.trigger, undefined);
});

test("a user reply is posted immediately and the transport payload has no trigger", async () => {
  const bodies: string[] = [];
  const result = await deliverTelegramReplies(
    [{ chatId: "123", text: "👋 Вітаємо, Іра!", trigger: "user" }],
    "token",
    {
      now: () => 0,
      request: async (_url, init) => {
        bodies.push(String(init?.body ?? ""));
        return new Response(JSON.stringify({ ok: true, result: { message_id: 4 } }), { status: 200 });
      },
    },
  );
  assert.equal(result.sent, 1);
  assert.deepEqual(result.deferred, []);
  assert.equal(bodies.length, 1);
  const payload = JSON.parse(bodies[0]!) as { text?: string; trigger?: string };
  assert.match(payload.text ?? "", /Вітаємо/);
  assert.equal(payload.trigger, undefined);
  assert.equal(shouldHoldForQuietHours(overnight, 23, "user"), false);
});
