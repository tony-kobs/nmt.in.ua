import assert from "node:assert/strict";
import test from "node:test";

import { readMigrateToChatId, sendTelegramPayload } from "./transport";

test("a group upgrade keeps only the numeric migrate_to_chat_id", async () => {
  assert.equal(readMigrateToChatId(null), undefined);
  assert.equal(readMigrateToChatId({ parameters: { migrate_to_chat_id: 1.5 } }), undefined);
  assert.equal(readMigrateToChatId({ parameters: { migrate_to_chat_id: "chat" } }), undefined);
  assert.equal(readMigrateToChatId({ parameters: { migrate_to_chat_id: -1009876543210 } }), "-1009876543210");

  const description = "Bad Request: group chat was upgraded to a supergroup chat";
  const result = await sendTelegramPayload({
    method: "sendMessage",
    token: "123:secret-token",
    request: async () => new Response(JSON.stringify({
      ok: false,
      error_code: 400,
      description,
      parameters: { migrate_to_chat_id: -1009876543210 },
    }), { status: 400 }),
  });

  assert.equal(result.status, "rejected");
  if (result.status !== "rejected") return;
  assert.equal(result.context.migrateToChatId, "-1009876543210");
  assert.equal(result.context.errorCode, 400);
  assert.equal(JSON.stringify(result).includes(description), false);
  assert.equal(JSON.stringify(result).includes("secret-token"), false);
});
