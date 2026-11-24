import assert from "node:assert/strict";
import test from "node:test";
import {
  lookupPublishedVersion,
  resetPublishedVersionCache,
  tagsFromGithubPayload,
  versionForDeployedSha,
} from "./githubReleaseTag";

const SHA = "ab".repeat(20);

test("github tag payload keeps semver names and peeled commit shas", () => {
  const tags = tagsFromGithubPayload([
    { name: "v1.0.0", commit: { sha: SHA.toUpperCase() } },
    { name: "v1.2.3-rc.1", commit: { sha: "cd".repeat(20) } },
    { name: "nightly", commit: { sha: "ef".repeat(20) } },
    { name: "v0.9.0" },
  ]);
  assert.deepEqual(tags, [{ name: "v1.0.0", sha: SHA }]);
});

test("a baked version wins and a matching tag fills a null build", () => {
  const tags = [{ name: "v1.0.0", sha: SHA }];
  assert.equal(versionForDeployedSha(tags, SHA, "v0.1.0"), "v0.1.0");
  assert.equal(versionForDeployedSha(tags, SHA, null), "v1.0.0");
  assert.equal(versionForDeployedSha(tags, "cd".repeat(20), null), null);
});

test("a published tag is cached and a miss is asked again after the ttl", async () => {
  resetPublishedVersionCache();
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return {
      ok: true,
      json: async () => [{ name: calls === 1 ? "nope" : "v1.0.0", commit: { sha: SHA } }],
    };
  }) as unknown as typeof fetch;

  assert.equal(await lookupPublishedVersion(SHA, { now: 0, ttlMs: 1000, fetchImpl }), null);
  assert.equal(await lookupPublishedVersion(SHA, { now: 500, ttlMs: 1000, fetchImpl }), null);
  assert.equal(calls, 1);
  assert.equal(await lookupPublishedVersion(SHA, { now: 1000, ttlMs: 1000, fetchImpl }), "v1.0.0");
  assert.equal(await lookupPublishedVersion(SHA, { now: 5000, ttlMs: 1000, fetchImpl }), "v1.0.0");
  assert.equal(calls, 2);
  resetPublishedVersionCache();
});

test("a github failure leaves the version empty", async () => {
  resetPublishedVersionCache();
  const fetchImpl = (async () => {
    throw new Error("network");
  }) as unknown as typeof fetch;
  assert.equal(await lookupPublishedVersion(SHA, { now: 0, fetchImpl }), null);
  resetPublishedVersionCache();
});
