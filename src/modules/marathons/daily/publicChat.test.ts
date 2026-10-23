import assert from "node:assert/strict";
import test from "node:test";

import { COPY_DEFAULTS } from "./copy";
import { ONEMATH_PUBLIC_CHAT, resolvePublicChatUrl } from "./publicChat";
import { publicChatNotice } from "@/modules/support/text";

test("onemath keeps the public chat when the field is empty, and another url wins", () => {
  assert.equal(resolvePublicChatUrl("onemath", null), ONEMATH_PUBLIC_CHAT.url);
  assert.equal(resolvePublicChatUrl("onemath", "  "), ONEMATH_PUBLIC_CHAT.url);
  assert.equal(resolvePublicChatUrl("onemath", "https://t.me/other"), "https://t.me/other");
  assert.equal(resolvePublicChatUrl("math-5", ""), "");
  const line = publicChatNotice(resolvePublicChatUrl("onemath", ""), undefined);
  assert.equal(line, COPY_DEFAULTS.bot_help_chat.replace("{link}", ONEMATH_PUBLIC_CHAT.url));
  assert.match(line ?? "", /https:\/\/t\.me\/nmt_onemath/);
});
