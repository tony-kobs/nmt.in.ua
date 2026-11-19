import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { run } from "./test-run.mjs";

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const versionScript = path.join(root, "scripts/next-release-version.sh");
const createScript = path.join(root, "scripts/create-github-release.sh");

async function git(cwd, args) {
  const { stdout } = await exec("git", args, { cwd, encoding: "utf8" });
  return stdout.trim();
}

async function initRepo() {
  const cwd = await mkdtemp(path.join(tmpdir(), "release-"));
  await git(cwd, ["init", "-q"]);
  await git(cwd, ["config", "user.email", "test@example.com"]);
  await git(cwd, ["config", "user.name", "Test"]);
  await git(cwd, ["config", "commit.gpgsign", "false"]);
  return cwd;
}

async function commitAll(cwd, commits) {
  for (const commit of commits) {
    const args = ["commit", "--allow-empty", "-m", commit.message];
    if (commit.body) args.push("-m", commit.body);
    await git(cwd, args);
    for (const tag of commit.tags ?? []) {
      await git(cwd, ["tag", tag]);
    }
  }
  return git(cwd, ["rev-parse", "HEAD"]);
}

async function nextVersion(cwd, sha, labels = "") {
  const result = await run("bash", [versionScript], {
    cwd,
    env: { ...process.env, RELEASE_SHA: sha, RELEASE_LABELS: labels },
  });
  assert.equal(result.code, 0, result.stderr);
  return result.stdout.trim();
}

const cases = [
  {
    name: "no tags and a fix commit is a patch from 0.0.0",
    commits: [{ message: "fix: typo" }],
    expected: "v0.0.1",
  },
  {
    name: "no tags and a feat commit is 0.1.0",
    commits: [{ message: "feat: first" }],
    expected: "v0.1.0",
  },
  {
    name: "no tags and release:major is 1.0.0",
    commits: [{ message: "fix: typo" }],
    labels: "release:major",
    expected: "v1.0.0",
  },
  {
    name: "patch after the latest semver tag",
    commits: [
      { message: "feat: start", tags: ["v0.1.0"] },
      { message: "fix: typo" },
    ],
    expected: "v0.1.1",
  },
  {
    name: "feat subject bumps minor",
    commits: [
      { message: "init", tags: ["v0.1.0"] },
      { message: "feat: add version" },
    ],
    expected: "v0.2.0",
  },
  {
    name: "feat scope bumps minor",
    commits: [
      { message: "init", tags: ["v0.1.0"] },
      { message: "feat(api): add version" },
    ],
    expected: "v0.2.0",
  },
  {
    name: "feat breaking marker stays minor",
    commits: [
      { message: "init", tags: ["v0.1.0"] },
      { message: "feat!: break" },
    ],
    expected: "v0.2.0",
  },
  {
    name: "release:minor label bumps minor without a feat commit",
    commits: [
      { message: "init", tags: ["v0.1.0"] },
      { message: "fix: typo" },
    ],
    labels: "release:minor",
    expected: "v0.2.0",
  },
  {
    name: "release:major wins over feat and release:minor",
    commits: [
      { message: "init", tags: ["v1.2.3"] },
      { message: "feat: add" },
    ],
    labels: "release:minor,release:major",
    expected: "v2.0.0",
  },
  {
    name: "highest semver tag wins over smaller and non-semver tags",
    commits: [
      { message: "a", tags: ["v0.9.0"] },
      { message: "b", tags: ["v0.10.0", "v1.2.3-rc.1", "v1.2"] },
      { message: "fix: typo" },
    ],
    expected: "v0.10.1",
  },
  {
    name: "a feat line in the body stays a patch",
    commits: [
      { message: "init", tags: ["v0.1.0"] },
      { message: "Feature: nope", body: "feat: hidden" },
    ],
    expected: "v0.1.1",
  },
];

for (const spec of cases) {
  test(spec.name, async () => {
    const cwd = await initRepo();
    try {
      const sha = await commitAll(cwd, spec.commits);
      assert.equal(await nextVersion(cwd, sha, spec.labels ?? ""), spec.expected);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
}

test("create script skips a commit that already has a tag and does not call gh", async () => {
  const cwd = await initRepo();
  try {
    const sha = await commitAll(cwd, [{ message: "fix: typo", tags: ["nightly"] }]);
    const bin = path.join(cwd, "bin");
    await mkdir(bin);
    const gh = path.join(bin, "gh");
    await writeFile(gh, "#!/bin/sh\necho 'gh should not run' >&2\nexit 99\n", "utf8");
    await chmod(gh, 0o755);
    const output = path.join(cwd, "output.txt");
    const result = await run("bash", [createScript], {
      cwd,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        GITHUB_SHA: sha,
        GITHUB_OUTPUT: output,
        RELEASE_LABELS: "",
        DRY_RUN: "1",
      },
    });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /already tagged/);
    assert.equal(await readFile(output, "utf8"), "skip=true\n");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("create script dry-run prints the next version and does not call gh", async () => {
  const cwd = await initRepo();
  try {
    const sha = await commitAll(cwd, [
      { message: "init", tags: ["v0.1.0"] },
      { message: "feat(api): add version" },
    ]);
    const bin = path.join(cwd, "bin");
    await mkdir(bin);
    const gh = path.join(bin, "gh");
    await writeFile(gh, "#!/bin/sh\necho 'gh should not run' >&2\nexit 99\n", "utf8");
    await chmod(gh, 0o755);
    const result = await run("bash", [createScript], {
      cwd,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        GITHUB_SHA: sha,
        RELEASE_LABELS: "",
        DRY_RUN: "1",
      },
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout.trim(), "v0.2.0");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
