import assert from "node:assert/strict";
import test from "node:test";

import { verifyPassword } from "../src/modules/auth/password.ts";
import {
  LOCAL_ACCOUNTS,
  LOCAL_PASSWORD,
  hashLocalPassword,
  isLocalDatabaseTarget,
} from "./seed-local.mjs";

test("local seed accepts only a loopback database", () => {
  assert.equal(isLocalDatabaseTarget({ DB_HOST: "127.0.0.1", DB_NAME: "nmt_local" }), true);
  assert.equal(isLocalDatabaseTarget({ DB_HOST: "localhost", DB_NAME: "nmt_local" }), true);
  assert.equal(isLocalDatabaseTarget({ DB_HOST: "::1", DB_NAME: "nmt_local" }), true);
  assert.equal(isLocalDatabaseTarget({ DB_HOST: "db.example.com", DB_NAME: "nmt_local" }), false);
  assert.equal(isLocalDatabaseTarget({ DB_HOST: "127.0.0.1", DB_NAME: "levelhst_maththemes" }), false);
  assert.equal(isLocalDatabaseTarget({ DB_HOST: "", DB_NAME: "nmt_local" }), false);
});

test("local seed password matches the app scrypt check", () => {
  assert.equal(verifyPassword(LOCAL_PASSWORD, hashLocalPassword(LOCAL_PASSWORD)), true);
  assert.equal(verifyPassword("other-password", hashLocalPassword(LOCAL_PASSWORD)), false);
});

test("local seed covers student, teacher, admin and dev", () => {
  assert.deepEqual(
    LOCAL_ACCOUNTS.map((account) => account.role),
    ["student", "teacher", "admin", "dev"],
  );
});
