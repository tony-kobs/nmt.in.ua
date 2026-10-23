import assert from "node:assert/strict";
import test from "node:test";

import {
  classifySchemaLockHolder,
  isSchemaWork,
  lockDenied,
  lockGranted,
} from "../../../scripts/schema-lock.mjs";

test("a session applying DDL keeps the schema lock", () => {
  const holder = { command: "Query", timeSec: 40, info: "ALTER TABLE app_users ADD COLUMN x INT" };
  assert.equal(isSchemaWork(holder), true);
  assert.equal(classifySchemaLockHolder(holder, 60), "busy");
});

test("an idle session that still holds the schema lock is dropped", () => {
  assert.equal(
    classifySchemaLockHolder({ command: "Sleep", timeSec: 20, info: null }),
    "drop",
  );
  assert.equal(
    classifySchemaLockHolder({ command: "Sleep", timeSec: 5, info: null }, 15),
    "drop",
  );
});

test("an ordinary read on the lock holder is dropped", () => {
  assert.equal(
    classifySchemaLockHolder({
      command: "Query",
      timeSec: 1,
      info: "SELECT id FROM app_users WHERE login = 'a'",
    }),
    "drop",
  );
});

test("the migration journal check is not treated as a leaked lock", () => {
  assert.equal(
    classifySchemaLockHolder({
      command: "Query",
      timeSec: 2,
      info: "SELECT version FROM schema_migrations WHERE version IN ('001_app_users.sql')",
    }),
    "busy",
  );
});

test("a vanished lock owner is retried", () => {
  assert.equal(classifySchemaLockHolder(null), "retry");
  assert.equal(classifySchemaLockHolder({ command: "missing", timeSec: 0 }), "retry");
});

test("lock flags accept numbers, strings, and bigints", () => {
  assert.equal(lockGranted(1), true);
  assert.equal(lockGranted(BigInt(1)), true);
  assert.equal(lockGranted("1"), true);
  assert.equal(lockDenied(0), true);
  assert.equal(lockDenied(BigInt(0)), true);
  assert.equal(lockGranted(0), false);
});
