import assert from "node:assert/strict";
import test from "node:test";

import { loginUserSchema } from "./authValidation";
import { validateSchema } from "./parse";

test("sign-in folds the email to lowercase", () => {
  const parsed = validateSchema(loginUserSchema, {
    email: " Maria@Example.com ",
    password: "demo123",
  });

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.email, "maria@example.com");
  }
});
