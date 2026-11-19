import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const SHA = /^[0-9a-f]{40}$/i;
const VERSION = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

function git(args) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function highestTag(raw) {
  const tags = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => VERSION.test(line));
  if (tags.length === 0) return null;
  tags.sort((left, right) => {
    const a = left.slice(1).split(".").map(Number);
    const b = right.slice(1).split(".").map(Number);
    for (let index = 0; index < 3; index += 1) {
      if (a[index] !== b[index]) return a[index] - b[index];
    }
    return 0;
  });
  return tags[tags.length - 1];
}

const shaRaw = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || git(["rev-parse", "HEAD"]);
const sha = SHA.test(shaRaw.trim()) ? shaRaw.trim().toLowerCase() : null;
const envVersion = process.env.NEXT_PUBLIC_APP_VERSION || process.env.APP_VERSION || "";
const version = VERSION.test(envVersion.trim()) ? envVersion.trim() : highestTag(git(["tag", "--list", "v*"]));

const out = path.join(process.cwd(), "src/generated/deploy-revision.json");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ sha, version }, null, 2)}\n`);
console.log(`Wrote deploy revision sha=${sha ?? "none"} version=${version ?? "none"}.`);
