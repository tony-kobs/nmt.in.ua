import assert from "node:assert/strict";
import test from "node:test";
import {
  saveThemeSelfScoreAction,
  type SaveThemeSelfScoreInput,
} from "./actions";

test("saveThemeSelfScoreAction rejects a score outside 1-5", async () => {
  for (const score of [0, 6, 10] as const) {
    const result = await saveThemeSelfScoreAction(
      { themeId: 3, score },
      {
        requireUserId: async () => 1,
        recordSelfScore: async () => {
          throw new Error("should not be called");
        },
        revalidatePath: () => {},
      },
    );
    assert.deepEqual(result, { status: "error", code: "invalid_input" });
  }
});

test("saveThemeSelfScoreAction rejects a non-positive themeId", async () => {
  const result = await saveThemeSelfScoreAction(
    { themeId: 0, score: 4 },
    {
      requireUserId: async () => 1,
      recordSelfScore: async () => {
        throw new Error("should not be called");
      },
      revalidatePath: () => {},
    },
  );
  assert.deepEqual(result, { status: "error", code: "invalid_input" });
});

test("saveThemeSelfScoreAction returns unauthorized when there is no session", async () => {
  const result = await saveThemeSelfScoreAction(
    { themeId: 3, score: 4 },
    {
      requireUserId: async () => {
        throw new Error("no session");
      },
      recordSelfScore: async () => {
        throw new Error("should not be called");
      },
      revalidatePath: () => {},
    },
  );
  assert.deepEqual(result, { status: "error", code: "unauthorized" });
});

test("saveThemeSelfScoreAction inserts pre_topic and revalidates /results", async () => {
  const calls: SaveThemeSelfScoreInput[] = [];
  const paths: string[] = [];

  const result = await saveThemeSelfScoreAction(
    { themeId: 9, score: 4 },
    {
      requireUserId: async () => 42,
      recordSelfScore: async (raw) => {
        calls.push(raw as SaveThemeSelfScoreInput & { userId: number });
        assert.deepEqual(raw, {
          userId: 42,
          guestToken: null,
          themeId: 9,
          score: 4,
          source: "pre_topic",
        });
        return { id: 1 };
      },
      revalidatePath: (path) => {
        paths.push(path);
      },
    },
  );

  assert.deepEqual(result, { status: "success", score: 4 });
  assert.equal(calls.length, 1);
  assert.deepEqual(paths, ["/results"]);
});
