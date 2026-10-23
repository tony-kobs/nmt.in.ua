/**
 * Apply scripts/sql/*.sql in order and record them in schema_migrations.
 *
 * Idempotent on a database that already has the tables: duplicate column,
 * index, and table errors are skipped per statement. A file is recorded
 * only after every statement succeeds or is an expected duplicate.
 *
 * Usage (from the release directory, with DB_* in the environment or in
 * .env.production / .env.local):
 *   npm run migrate
 *   node scripts/migrate.mjs --check
 *
 * --check loads mysql2 and the SQL directory and exits before any connection.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { isIgnorableMigrationErrno, splitSqlStatements } from "./migrate-sql.mjs";
import {
  classifySchemaLockHolder,
  formatSchemaLockHolder,
  lockDenied,
  lockGranted,
} from "./schema-lock.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlDir = path.join(root, "scripts", "sql");

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  console.log(`Usage: node scripts/migrate.mjs [--check]

Apply scripts/sql/*.sql in filename order and record them in schema_migrations.

  --check      Load mysql2 and list SQL files. Do not read credentials or connect.
  -h, --help   Show this help.`);
  process.exit(0);
}

const unknown = args.filter((arg) => arg !== "--check");
if (unknown.length > 0) {
  console.error(`Unknown argument: ${unknown[0]}`);
  process.exit(1);
}

if (!fs.existsSync(sqlDir)) {
  throw new Error("Missing SQL directory: scripts/sql");
}

const files = fs
  .readdirSync(sqlDir)
  .filter((name) => name.endsWith(".sql"))
  .sort((left, right) => left.localeCompare(right, "en"));

if (files.length === 0) {
  throw new Error("No SQL files in scripts/sql.");
}

if (args.includes("--check")) {
  if (typeof mysql.createConnection !== "function") {
    throw new Error("mysql2/promise did not resolve.");
  }
  console.log(`migrate check ok (${files.length} sql files, mysql2 resolved)`);
  process.exit(0);
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(root, ".env.production"));
loadEnvFile(path.join(root, ".env.local"));

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} for npm run migrate.`);
  return value;
}

function errnoOf(error) {
  if (typeof error === "object" && error !== null && "errno" in error) {
    return Number(error.errno);
  }
  return undefined;
}

const SCHEMA_LOCK = "nmt_schema";
const SCHEMA_LOCK_WAIT_SEC = 10;
const SCHEMA_LOCK_BUDGET_MS = 12 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function schemaLockHolder(conn) {
  const [lockRows] = await conn.query("SELECT IS_USED_LOCK(?) AS owner", [SCHEMA_LOCK]);
  const owner = Array.isArray(lockRows) ? lockRows[0]?.owner : undefined;
  if (owner == null) return null;
  const id = Number(owner);
  if (!Number.isSafeInteger(id) || id <= 0) return { id: owner, command: "missing", timeSec: 0 };
  const [procs] = await conn.query(
    `SELECT ID, COMMAND, TIME, STATE, LEFT(INFO, 120) AS INFO
     FROM information_schema.PROCESSLIST WHERE ID = ?`,
    [id],
  );
  const row = Array.isArray(procs) ? procs[0] : undefined;
  if (!row) return { id, command: "missing", timeSec: 0 };
  return {
    id,
    command: String(row.COMMAND ?? ""),
    timeSec: Number(row.TIME) || 0,
    state: row.STATE ?? "",
    info: row.INFO ?? null,
  };
}

async function dropSchemaLockHolder(conn, holder) {
  const id = Number(holder?.id);
  if (!Number.isSafeInteger(id) || id <= 0) return;
  const [selfRows] = await conn.query("SELECT CONNECTION_ID() AS id");
  const selfId = Number(Array.isArray(selfRows) ? selfRows[0]?.id : undefined);
  if (id === selfId) return;
  const fresh = await schemaLockHolder(conn);
  const ageSec = fresh?.id === id ? 15 : 0;
  if (!fresh || fresh.id !== id || classifySchemaLockHolder(fresh, ageSec) !== "drop") return;
  console.error(
    `dropping session ${id} that holds ${SCHEMA_LOCK} without a migration (${formatSchemaLockHolder(fresh)})`,
  );
  try {
    await conn.query(`KILL ${id}`);
  } catch (error) {
    console.error(`could not drop session ${id}`, error instanceof Error ? error.message : error);
  }
}

async function acquireSchemaLock(conn) {
  const started = Date.now();
  let watched = null;
  let lastHolder = null;
  while (Date.now() - started < SCHEMA_LOCK_BUDGET_MS) {
    const attemptStarted = Date.now();
    const [lockRows] = await conn.query(
      `SELECT GET_LOCK(?, ${SCHEMA_LOCK_WAIT_SEC}) AS got`,
      [SCHEMA_LOCK],
    );
    const got = Array.isArray(lockRows) ? lockRows[0]?.got : undefined;
    if (lockGranted(got)) return;
    if (!lockDenied(got)) {
      throw new Error(`GET_LOCK(${SCHEMA_LOCK}) returned ${String(got)}`);
    }
    const holder = await schemaLockHolder(conn);
    lastHolder = holder;
    const watchedAgeSec =
      holder && watched && watched.id === holder.id ? (Date.now() - watched.since) / 1000 : 0;
    const action = classifySchemaLockHolder(holder, watchedAgeSec);
    console.error(
      `schema lock busy (${Math.round((Date.now() - started) / 1000)}s): ${formatSchemaLockHolder(holder)} -> ${action}`,
    );
    if (action === "drop") {
      await dropSchemaLockHolder(conn, holder);
      watched = null;
      continue;
    }
    if (action === "busy" || action === "retry" || !holder) watched = null;
    else if (!watched || watched.id !== holder.id) watched = { id: holder.id, since: Date.now() };
    if (Date.now() - attemptStarted < 1000) await sleep(2000);
  }
  throw new Error(
    `schema lock is busy; another migration is running. Last holder: ${formatSchemaLockHolder(lastHolder)}`,
  );
}

const conn = await mysql.createConnection({
  host: required("DB_HOST"),
  port: Number(process.env.DB_PORT ?? 3306),
  user: required("DB_USER"),
  password: required("DB_PASSWORD"),
  database: required("DB_NAME"),
  connectTimeout: 20_000,
  multipleStatements: false,
});

try {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(191) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (version)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );

  const [appliedRows] = await conn.query(`SELECT version FROM schema_migrations`);
  const applied = new Set(
    (Array.isArray(appliedRows) ? appliedRows : []).map((row) => String(row.version)),
  );

  await acquireSchemaLock(conn);

  try {
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip ${file}`);
        continue;
      }
      const sql = fs.readFileSync(path.join(sqlDir, file), "utf8");
      const statements = splitSqlStatements(sql);
      console.log(`apply ${file} (${statements.length} statements)`);
      for (const statement of statements) {
        try {
          await conn.query(statement);
        } catch (error) {
          const errno = errnoOf(error);
          if (isIgnorableMigrationErrno(errno)) {
            console.log(`  duplicate schema (${errno}), continue`);
            continue;
          }
          console.error(`failed in ${file}: ${statement.slice(0, 180)}`);
          throw error;
        }
      }
      await conn.query(`INSERT INTO schema_migrations (version) VALUES (?)`, [file]);
      applied.add(file);
    }
  } finally {
    await conn.query(`SELECT RELEASE_LOCK(?)`, [SCHEMA_LOCK]);
  }
  console.log(`migrate ok (${applied.size} versions)`);
} finally {
  await conn.end();
}
