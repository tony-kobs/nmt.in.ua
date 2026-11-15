import assert from "node:assert/strict";
import test from "node:test";
import uk from "../../messages/uk.json";
import en from "../../messages/en.json";
import de from "../../messages/de.json";
import { pickClientMessages } from "./clientMessages";

test("parent registration translations are complete for all locales and public navigation", () => {
  const keys = Object.keys(uk.ParentRegister).sort();
  for (const messages of [uk, en, de]) {
    assert.deepEqual(Object.keys(messages.ParentRegister).sort(), keys);
    assert.ok(Object.values(messages.ParentRegister).every((text) => text.trim().length > 0));
    for (const path of ["/welcome", "/login", "/register", "/register/parent"]) {
      const picked = pickClientMessages(messages, path);
      assert.deepEqual(picked.ParentRegister, messages.ParentRegister);
      assert.deepEqual(picked.RegisterForm, messages.RegisterForm);
      assert.deepEqual(picked.AuthShared, messages.AuthShared);
    }
  }
});
