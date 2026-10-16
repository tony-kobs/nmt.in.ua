import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("promote-admin revokes open sessions in the same transaction as the role change", () => {
  const source = readFileSync(
    path.join(process.cwd(), "scripts/promote-admin.mjs"),
    "utf8",
  );
  assert.match(source, /beginTransaction/);
  assert.match(source, /UPDATE app_users[\s\S]*role = 'admin'/);
  assert.match(source, /UPDATE user_sessions[\s\S]*revoked_at/);
  assert.match(source, /revoked_at IS NULL/);
  assert.match(source, /commit/);
});
