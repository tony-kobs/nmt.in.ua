import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Historical pairs already recorded in schema_migrations. Do not add a third file. */
export const ALLOWED_DUPLICATE_NUMBERS = {
  "032": ["032_stage2_bank.sql", "032_teacher_ratings.sql"],
  "044": ["044_notification_channels_and_invites.sql", "044_user_sessions.sql"],
};

export function sqlNumberProblems(fileNames) {
  const byNumber = new Map();
  const problems = [];

  for (const name of fileNames) {
    const match = /^(\d+)_/.exec(name);
    if (!match) {
      problems.push(`${name}: імʼя міграції має починатись із номера`);
      continue;
    }
    const number = match[1];
    const list = byNumber.get(number) ?? [];
    list.push(name);
    byNumber.set(number, list);
  }

  for (const [number, files] of byNumber) {
    if (files.length < 2) continue;
    const allowed = ALLOWED_DUPLICATE_NUMBERS[number];
    const actual = [...files].sort().join("\n");
    const expected = allowed ? [...allowed].sort().join("\n") : "";
    if (actual !== expected) {
      problems.push(`номер ${number} повторюється: ${[...files].sort().join(", ")}`);
    }
  }

  return problems;
}

function main() {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "sql");
  const names = readdirSync(dir).filter((name) => name.endsWith(".sql"));
  const problems = sqlNumberProblems(names);
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(`scripts/sql: ${names.length} файлів, нових дублів номерів немає.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
