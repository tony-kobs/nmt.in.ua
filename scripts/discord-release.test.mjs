import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { run } from "./test-run.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts/discord-release.sh");
const sha = "ab".repeat(20);
const webhook = "https://discord.example.test/api/webhooks/123/super-secret-token";

async function tempDir() {
  return mkdtemp(path.join(tmpdir(), "discord-"));
}

async function releaseFile(dir, release) {
  const file = path.join(dir, "release.json");
  await writeFile(file, JSON.stringify(release), "utf8");
  return file;
}

function env(extra) {
  return {
    ...process.env,
    DISCORD_WEBHOOK: webhook,
    DISCORD_COMMIT_SHA: sha,
    DISCORD_DRY_RUN: "1",
    ...extra,
  };
}

test("dry run builds the nmt release embed and does not reveal the webhook", async () => {
  const dir = await tempDir();
  try {
    const file = await releaseFile(dir, {
      tagName: "v1.2.3",
      name: "v1.2.3",
      body: "Привіт",
      url: "https://github.com/tony-kobs/nmt.in.ua/releases/tag/v1.2.3",
    });
    const result = await run("bash", [script, file], { env: env({}) });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout.includes(webhook), false);
    assert.equal(result.stdout.includes("super-secret-token"), false);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.username, "nmt.in.ua · реліз");
    assert.deepEqual(payload.allowed_mentions.parse, []);
    assert.equal(payload.embeds.length, 1);
    assert.equal(payload.embeds[0].title, "nmt.in.ua v1.2.3");
    assert.equal(payload.embeds[0].url, "https://github.com/tony-kobs/nmt.in.ua/releases/tag/v1.2.3");
    assert.equal(payload.embeds[0].footer.text, "tony-kobs/nmt.in.ua");
    assert.match(payload.embeds[0].description, /v1\.2\.3/);
    assert.match(payload.embeds[0].description, /Привіт/);
    assert.match(payload.embeds[0].description, /`abababa`/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a long release body is cut near 1500 characters and still includes the sha", async () => {
  const dir = await tempDir();
  try {
    const body = "б".repeat(1800);
    const file = await releaseFile(dir, {
      tagName: "v0.2.0",
      name: "Назва",
      body,
      url: "https://github.com/tony-kobs/nmt.in.ua/releases/tag/v0.2.0",
    });
    const result = await run("bash", [script, file], { env: env({}) });
    assert.equal(result.code, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    const description = payload.embeds[0].description;
    assert.ok(description.length <= 4096);
    assert.match(description, /…/);
    assert.match(description, /`abababa`/);
    assert.equal(description.includes(body), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a non-https webhook is refused before curl runs", async () => {
  const dir = await tempDir();
  try {
    const bin = path.join(dir, "bin");
    const marker = path.join(dir, "curl-called");
    await mkdir(bin);
    await writeFile(
      path.join(bin, "curl"),
      `#!/bin/sh\necho called > ${JSON.stringify(marker)}\nexit 99\n`,
      "utf8",
    );
    await chmod(path.join(bin, "curl"), 0o755);
    const file = await releaseFile(dir, {
      tagName: "v1.2.3",
      name: "v1.2.3",
      body: "",
      url: "https://github.com/tony-kobs/nmt.in.ua/releases/tag/v1.2.3",
    });
    const result = await run("bash", [script, file], {
      env: env({
        DISCORD_WEBHOOK: "http://discord.example.test/hook",
        PATH: `${bin}:${process.env.PATH}`,
      }),
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /https URL/);
    await assert.rejects(() => import("node:fs/promises").then((fs) => fs.stat(marker)));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
