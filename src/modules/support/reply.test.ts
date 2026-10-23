import assert from "node:assert/strict";
import test from "node:test";

import { sendTelegramMessage } from "@/modules/telegram/transport";

test("a continuation in the team chat quotes the original card", async () => {
  const seen: Record<string, unknown>[] = [];
  const request: typeof fetch = async (_url, init) => {
    seen.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ ok: true, result: { message_id: 9 } }));
  };
  await sendTelegramMessage({
    chatId: "-100",
    text: "Продовження",
    replyToMessageId: 42,
    disablePreview: true,
  }, "token", request);
  assert.equal(seen[0]?.reply_to_message_id, 42);

  await sendTelegramMessage({
    chatId: "-100",
    text: "Правка",
    editMessageId: 3,
    replyToMessageId: 42,
  }, "token", request);
  assert.equal(seen[1]?.reply_to_message_id, undefined);
  assert.equal(seen[1]?.message_id, 3);
});
