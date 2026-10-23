import assert from "node:assert/strict";
import test from "node:test";
import {
  MARATHON_DRAFT_KEY,
  SKEW_RELOAD_KEY,
  claimSkewReload,
  isDeploymentSkewError,
  readMarathonDraft,
} from "./deploymentSkew";

function memoryStorage(): Storage {
  const bag = new Map<string, string>();
  return {
    get length() {
      return bag.size;
    },
    clear: () => bag.clear(),
    getItem: (key) => bag.get(key) ?? null,
    key: (index) => [...bag.keys()][index] ?? null,
    removeItem: (key) => {
      bag.delete(key);
    },
    setItem: (key, value) => {
      bag.set(key, value);
    },
  };
}

test("recognises a stale server action and a missing chunk", () => {
  assert.equal(
    isDeploymentSkewError(
      new Error(
        'Failed to find Server Action "40911cee". This request might be from an older or newer deployment.',
      ),
    ),
    true,
  );
  const unrecognized = new Error(
    'Server Action "40911cee" was not found on the server.',
  );
  unrecognized.name = "UnrecognizedActionError";
  assert.equal(isDeploymentSkewError(unrecognized), true);
  const chunk = new Error("Loading chunk 12 failed.");
  chunk.name = "ChunkLoadError";
  assert.equal(isDeploymentSkewError(chunk), true);
  assert.equal(
    isDeploymentSkewError("Failed to fetch dynamically imported module"),
    true,
  );
});

test("leaves ordinary failures on the error page", () => {
  assert.equal(isDeploymentSkewError(new Error("db down")), false);
  assert.equal(isDeploymentSkewError(null), false);
  assert.equal(isDeploymentSkewError(undefined), false);
});

test("allows one reload, then blocks until the window passes", () => {
  const storage = memoryStorage();
  assert.equal(claimSkewReload(storage, 1_000, 20_000), true);
  assert.equal(storage.getItem(SKEW_RELOAD_KEY), "1000");
  assert.equal(claimSkewReload(storage, 5_000, 20_000), false);
  assert.equal(claimSkewReload(storage, 21_000, 20_000), true);
});

test("restores only this page's marathon task radios", () => {
  const raw = JSON.stringify({
    href: "/marathon/math/day/2",
    answers: {
      task_15: "3",
      task_bad: "1",
      other: "1",
      task_16: "nope",
    },
  });
  assert.deepEqual(readMarathonDraft(raw, "/marathon/math/day/2"), { task_15: "3" });
  assert.equal(readMarathonDraft(raw, "/marathon/math/day/3"), null);
  assert.equal(readMarathonDraft("not-json", "/marathon/math/day/2"), null);
  assert.equal(MARATHON_DRAFT_KEY, "nmt-marathon-day-draft");
});
