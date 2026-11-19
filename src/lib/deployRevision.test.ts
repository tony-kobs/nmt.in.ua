import assert from "node:assert/strict";
import test from "node:test";
import { revisionFromEnv, revisionFromRecord } from "./deployRevision";

const SHA = "ab".repeat(20);

test("Vercel SHA and a public version win over the build file", () => {
  const revision = revisionFromRecord(
    { sha: "cd".repeat(20), version: "v0.1.0" },
    {
      VERCEL_GIT_COMMIT_SHA: SHA.toUpperCase(),
      NEXT_PUBLIC_APP_VERSION: "v1.2.3",
    },
  );
  assert.deepEqual(revision, { sha: SHA, version: "v1.2.3" });
});

test("the build file fills sha and version when Vercel env is absent", () => {
  const revision = revisionFromRecord(
    { sha: `  ${SHA}\n`, version: "v0.9.1" },
    {},
  );
  assert.deepEqual(revision, { sha: SHA, version: "v0.9.1" });
});

test("package-like and short values are not a deployed revision", () => {
  assert.deepEqual(
    revisionFromEnv({
      GIT_COMMIT_SHA: "abc",
      APP_VERSION: "0.1.0",
      NEXT_PUBLIC_APP_VERSION: "v1.2.3-rc.1",
    }),
    { sha: null, version: null },
  );
});
