import assert from "node:assert/strict";
import test from "node:test";
import type { ChildProgress } from "./buildChildProgress";
import { loadParentDashboard } from "./loadParentDashboard";
import { ParentAccessError, type ParentChild } from "./types";

const children = [{ id: 12, displayName: "First" }, { id: 34, displayName: "Second" }];
function fixture(roster: ParentChild[] = children) {
  const calls: number[] = [];
  return { calls, deps: {
    getChildren: async () => roster,
    getProgress: async (id: unknown): Promise<ChildProgress> => {
      calls.push(Number(id));
      return { child: roster.find((child) => child.id === id)!,
        summary: { completedSessions: 0, totalTasks: 0, correctAnswers: 0, correctPercent: null },
        topics: [], recentResults: [] };
    },
  } };
}

test("dashboard automatically loads the only child or defaults to the first child", async () => {
  for (const roster of [children.slice(0, 1), children]) {
    const { deps, calls } = fixture(roster);
    const result = await loadParentDashboard(undefined, deps);
    assert.deepEqual(calls, [12]);
    assert.equal(result.progress?.child.id, 12);
  }
});
test("dashboard switches to the explicit child and preserves the empty test state", async () => {
  const { deps, calls } = fixture();
  const result = await loadParentDashboard("34", deps);
  assert.deepEqual(calls, [34]);
  assert.equal(result.progress?.summary.correctPercent, null);
  assert.deepEqual(result.progress?.topics, []);
  assert.deepEqual(result.progress?.recentResults, []);
});
test("parent without children does not query progress", async () => {
  const { deps, calls } = fixture([]);
  assert.deepEqual(await loadParentDashboard(undefined, deps), { children: [], progress: null });
  assert.deepEqual(calls, []);
});
test("foreign, malformed, duplicate and unsafe child IDs are not_found", async () => {
  for (const raw of ["999", "", "-1", "1.5", "012", "12x", "9007199254740992", ["12", "34"]]) {
    const { deps, calls } = fixture();
    await assert.rejects(loadParentDashboard(raw, deps), (error) => error instanceof ParentAccessError && error.code === "not_found");
    assert.deepEqual(calls, []);
  }
});
test("link revocation after roster read is still rejected by the progress backend", async () => {
  const { deps } = fixture();
  const failure = new ParentAccessError("not_found");
  deps.getProgress = async () => { throw failure; };
  await assert.rejects(loadParentDashboard("12", deps), (error) => error === failure);
});
test("authorization and DB failures propagate instead of becoming an empty dashboard", async () => {
  for (const operation of ["getChildren", "getProgress"] as const) {
    for (const error of [new Error("DB unavailable"), new ParentAccessError("forbidden")]) {
      const { deps } = fixture();
      deps[operation] = async () => { throw error; };
      await assert.rejects(loadParentDashboard(undefined, deps), (actual) => actual === error);
    }
  }
});
