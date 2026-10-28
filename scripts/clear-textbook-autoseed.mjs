/**
 * Drop textbook rows that the first editor build auto-published from a lossy
 * conversion of the static conspects.
 *
 * A row matches only when `published_body` is exactly the snapshot for that
 * theme. If the draft is the same text, the row is deleted and students see
 * the static conspect again. If an admin already changed the draft, only
 * `published_body` is cleared so the draft stays.
 *
 * Does not run unless you pass --yes. Without --yes it prints the plan and
 * still needs DB_* (or .env.local / .env.production). It never prints the
 * textbook text.
 *
 *   node scripts/clear-textbook-autoseed.mjs
 *   node scripts/clear-textbook-autoseed.mjs --yes
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import mysql from "mysql2/promise";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = path.join(root, "scripts", "data", "textbook-autoseed-snapshot.json");

/**
 * @param {{ themeCode: string, body: string, publishedBody: string | null }} row
 * @param {Record<string, string>} snapshots
 * @returns {"delete" | "clear-published" | "keep"}
 */
export function textbookAutoseedAction(row, snapshots) {
  const seeded = snapshots[row.themeCode];
  if (typeof seeded !== "string") return "keep";
  if (row.publishedBody !== seeded) return "keep";
  if (row.body === seeded) return "delete";
  return "clear-published";
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

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. Set it or add .env.local.`);
  return value;
}

async function main() {
  const write = process.argv.includes("--yes");
  const snapshots = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  loadEnvFile(path.join(root, ".env.production"));
  loadEnvFile(path.join(root, ".env.local"));
  const conn = await mysql.createConnection({
    host: required("DB_HOST"),
    port: Number(process.env.DB_PORT ?? 3306),
    user: required("DB_USER"),
    password: required("DB_PASSWORD"),
    database: required("DB_NAME"),
    connectTimeout: 20_000,
    multipleStatements: false,
  });
  const counts = { delete: 0, "clear-published": 0, keep: 0, missing: 0 };
  try {
    let rows;
    try {
      const [found] = await conn.query(
        `SELECT theme_code, body, published_body FROM textbook_sections`,
      );
      rows = Array.isArray(found) ? found : [];
    } catch (error) {
      if (error && typeof error === "object" && error.errno === 1146) {
        console.log("textbook_sections is missing. Nothing to clear.");
        return;
      }
      throw error;
    }
    for (const row of rows) {
      const action = textbookAutoseedAction(
        {
          themeCode: String(row.theme_code),
          body: String(row.body ?? ""),
          publishedBody: row.published_body == null ? null : String(row.published_body),
        },
        snapshots,
      );
      counts[action] += 1;
      if (!write || action === "keep") continue;
      if (action === "delete") {
        await conn.execute(`DELETE FROM textbook_sections WHERE theme_code = ?`, [
          row.theme_code,
        ]);
      } else {
        await conn.execute(
          `UPDATE textbook_sections SET published_body = NULL WHERE theme_code = ?`,
          [row.theme_code],
        );
      }
    }
    const known = new Set(rows.map((row) => String(row.theme_code)));
    counts.missing = Object.keys(snapshots).filter((code) => !known.has(code)).length;
    console.log(
      `${write ? "applied" : "dry-run"} delete=${counts.delete} clear-published=${counts["clear-published"]} keep=${counts.keep} snapshot-without-row=${counts.missing}`,
    );
    if (!write) console.log("Pass --yes to write. A dry-run does not change the database.");
  } finally {
    await conn.end();
  }
}

const invoked =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
