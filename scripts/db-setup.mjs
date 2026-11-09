/**
 * Start the local MySQL container, apply scripts/sql, then seed fixtures.
 *   npm run db:setup
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const docker = spawnSync("docker", ["compose", "version"], { cwd: root, stdio: "ignore" });
if (docker.status !== 0) {
  console.error("Потрібен Docker із плагіном compose. Постав Docker Desktop або docker.io і docker-compose-v2.");
  process.exit(1);
}

const envLocal = path.join(root, ".env.local");
const envExample = path.join(root, ".env.example");
if (!fs.existsSync(envLocal)) {
  fs.copyFileSync(envExample, envLocal);
  console.log("Скопійовано .env.example → .env.local");
}

run("docker", ["compose", "up", "-d", "--wait"]);
run(process.execPath, ["scripts/migrate.mjs"]);
run(process.execPath, ["scripts/seed-local.mjs"]);
console.log("База готова. Далі: npm run dev → http://localhost:3000");
