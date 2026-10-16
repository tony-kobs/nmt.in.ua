/**
 * Promote a login to admin.
 * Usage: node scripts/promote-admin.mjs <login>
 * Reads DB_* from .env.local (never prints secrets).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const loginArg = String(process.argv[2] ?? "").trim().toLowerCase();
if (!loginArg) {
  console.error("Usage: node scripts/promote-admin.mjs <login>");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");

function loadEnv() {
  if (!fs.existsSync(envPath)) {
    throw new Error(".env.local not found — fill DB_* credentials first.");
  }
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
  const required = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing in .env.local: ${missing.join(", ")}`);
  }
}

loadEnv();

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectTimeout: 20_000,
});

console.log(`Connected to ${process.env.DB_HOST}/${process.env.DB_NAME}`);

try {
  const [found] = await conn.query(
    `SELECT id, login, role, is_banned FROM app_users WHERE login = ? LIMIT 1`,
    [loginArg],
  );
  if (!Array.isArray(found) || found.length === 0) {
    console.error(`User not found: ${loginArg}`);
    process.exitCode = 2;
  } else {
    const user = found[0];
    console.log(`Found: id=${user.id} login=${user.login} role=${user.role}`);
    if (user.role === "admin") {
      console.log("Already admin.");
    } else {
      await conn.beginTransaction();
      try {
        const [upd] = await conn.execute(
          `UPDATE app_users SET role = 'admin' WHERE id = ?`,
          [user.id],
        );
        const [revoked] = await conn.execute(
          `UPDATE user_sessions
           SET revoked_at = CURRENT_TIMESTAMP
           WHERE user_id = ? AND revoked_at IS NULL`,
          [user.id],
        );
        await conn.commit();
        console.log(
          `Promoted to admin (affected=${upd.affectedRows}, sessions revoked=${revoked.affectedRows}).`,
        );
      } catch (error) {
        await conn.rollback();
        throw error;
      }
    }
  }
} finally {
  await conn.end();
}
