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
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { isIgnorableMigrationErrno, splitSqlStatements } from "./migrate-sql.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlDir = path.join(root, "scripts", "sql");

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

const files = fs
  .readdirSync(sqlDir)
  .filter((name) => name.endsWith(".sql"))
  .sort((left, right) => left.localeCompare(right, "en"));

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

  const [lockRows] = await conn.query(`SELECT GET_LOCK('nmt_schema', 30) AS got`);
  const got = Array.isArray(lockRows) ? lockRows[0]?.got : undefined;
  if (got === 0 || got === "0") {
    throw new Error("schema lock is busy; another migration is running.");
  }

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
    await conn.query(`SELECT RELEASE_LOCK('nmt_schema')`);
  }
  console.log(`migrate ok (${applied.size} versions)`);
} finally {
  await conn.end();
}
