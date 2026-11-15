import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const target = { DB_HOST: "127.0.0.1", DB_PORT: "3306", DB_USER: "nmt_dev", DB_NAME: "nmt_local", DB_SSL: "0" };

export function localConfig(env: Record<string, string | undefined>, shell: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(target)) {
    if (env[key] !== value || (shell[key] !== undefined && shell[key] !== value)) {
      throw new Error(`Local integration refused: ${key} must match the fixed local target.`);
    }
  }
  if (!env.DB_PASSWORD?.trim()) throw new Error("Local integration refused: local password is missing.");
  return { host: target.DB_HOST, port: 3306, user: target.DB_USER,
    database: target.DB_NAME, password: env.DB_PASSWORD, connectTimeout: 5000 };
}

export function readLocalConfig() {
  // No Next loader, application pool, .env.production, or shell credentials.
  return localConfig(parseEnv(readFileSync(fileURLToPath(new URL("../.env.local", import.meta.url)), "utf8")), process.env);
}

export function verifyServer(row: Record<string, unknown>, machine = hostname()) {
  const normalize = (value: string) => value.toLowerCase().replace(/\.local\.?$/, "").replace(/\.$/, "");
  if (row.db !== "nmt_local" || !["nmt_dev@localhost", "nmt_dev@127.0.0.1"].includes(String(row.account))
    || normalize(String(row.host)) !== normalize(machine) || Number(row.port) !== 3306) {
    throw new Error("Local integration refused: DATABASE(), CURRENT_USER(), hostname or port mismatch.");
  }
}
