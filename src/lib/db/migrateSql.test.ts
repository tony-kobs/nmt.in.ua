import assert from "node:assert/strict";
import test from "node:test";

import { isIgnorableMigrationErrno, splitSqlStatements } from "../../../scripts/migrate-sql.mjs";

test("splitSqlStatements drops comments and empty pieces", () => {
  const source = `
    -- header
    SELECT 1;
    /* block
       comment */
    ALTER TABLE app_users ADD COLUMN is_banned TINYINT(1) NOT NULL DEFAULT 0;
    ;
  `;
  assert.deepEqual(splitSqlStatements(source), [
    "SELECT 1",
    "ALTER TABLE app_users ADD COLUMN is_banned TINYINT(1) NOT NULL DEFAULT 0",
  ]);
});

test("duplicate schema errors are ignorable and a missing table is not", () => {
  for (const errno of [1022, 1050, 1060, 1061, 1062, 1091, 1826]) {
    assert.equal(isIgnorableMigrationErrno(errno), true);
  }
  assert.equal(isIgnorableMigrationErrno(1146), false);
  assert.equal(isIgnorableMigrationErrno("1060"), true);
});
