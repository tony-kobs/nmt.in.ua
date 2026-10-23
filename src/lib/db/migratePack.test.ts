import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function runMigrate(args: string[]) {
  return spawnSync(process.execPath, ["scripts/migrate.mjs", ...args], {
    cwd: root,
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" },
  });
}

test("release pack list includes the migrate entrypoint and SQL", () => {
  const source = fs.readFileSync(path.join(root, "scripts/deploy-hosting.sh"), "utf8");
  const packStart = source.indexOf("PACK_PATHS=(");
  const packEnd = source.indexOf(")", packStart);
  assert.ok(packStart >= 0 && packEnd > packStart);
  const pack = source.slice(packStart, packEnd);
  for (const entry of ["scripts/migrate.mjs", "scripts/migrate-sql.mjs", "scripts/schema-lock.mjs", "scripts/sql"]) {
    assert.match(pack, new RegExp(`^\\s+${entry.replaceAll("/", "\\/")}\\s*$`, "m"));
  }

  const failed = source.indexOf("Migration failed; leaving the live site on the previous release.");
  const swap = source.indexOf('echo "==> Stop legacy nmt.pid, free the port, then swap www..."');
  assert.ok(failed > 0 && swap > failed);

  const executable = source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
  assert.match(executable, /tar -tzf "\$ARCHIVE" > "\$ARCHIVE_LIST"/);
  assert.doesNotMatch(executable, /tar -tzf[^\n]*\|/);
  assert.match(executable, /grep -qxF -- "\$1" "\$ARCHIVE_LIST"/);
});

test("migrate --check resolves modules and does not require a database", () => {
  const result = runMigrate(["--check"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /migrate check ok \(\d+ sql files, mysql2 resolved\)/);
  assert.equal(result.stderr, "");
});

test("migrate --help exits without connecting", () => {
  const result = runMigrate(["--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--check/);
});

test("migrate rejects unknown arguments", () => {
  const result = runMigrate(["--nope"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown argument: --nope/);
});
