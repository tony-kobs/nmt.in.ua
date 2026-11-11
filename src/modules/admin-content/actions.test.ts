import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteQuizTaskAction,
  deleteQuizTasksAction,
  deleteThemeParamAction,
  generateSimilarTasksAction,
  publishQuizTaskAction,
  saveQuizTaskAction,
  updateThemeDifficultyGuideAction,
} from "./actions";
import { AdminContentError } from "./types";

const admin = {
  id: 3,
  login: "demo-admin",
  displayName: "Адмін",
  role: "admin" as const,
};

const student = {
  id: 1,
  login: "demo-student",
  displayName: "Учень",
  role: "student" as const,
};

const sampleTask = {
  id: 10,
  name: "Додавання",
  taskText: "10+10=",
  themeId: 2,
  answer1: "10",
  answer2: "20",
  answer3: "30",
  answer4: "0",
  rightAnswerN: 2 as const,
  comments: "",
  difficulty: 3,
  params: [],
  status: "published" as const,
  sourceTaskId: null,
  hintShort: "",
};

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

test("saveQuizTaskAction creates when taskId is absent", async () => {
  let created = false;
  const state = await saveQuizTaskAction(
    { status: "idle" },
    form({
      name: "Додавання",
      taskText: "10+10=",
      themeId: "2",
      answer1: "10",
      answer2: "20",
      answer3: "30",
      answer4: "0",
      rightAnswerN: "2",
      difficulty: "3",
    }),
    {
      requireUser: async () => admin,
      createQuizTask: async () => {
        created = true;
        return sampleTask;
      },
      updateQuizTask: async () => {
        throw new Error("should not update");
      },
      revalidatePath: () => undefined,
      invalidateCatalogCache: () => undefined,
    },
  );

  assert.equal(created, true);
  assert.equal(state.status, "success");
  if (state.status === "success") {
    assert.equal(state.mode, "create");
    assert.equal(state.task.id, 10);
  }
});

test("saveQuizTaskAction updates when taskId is present", async () => {
  let updatedId = 0;
  const state = await saveQuizTaskAction(
    { status: "idle" },
    form({
      taskId: "10",
      name: "Додавання",
      taskText: "10+10=",
      themeId: "2",
      answer1: "10",
      answer2: "20",
      answer3: "30",
      answer4: "0",
      rightAnswerN: "2",
      difficulty: "3",
    }),
    {
      requireUser: async () => admin,
      createQuizTask: async () => {
        throw new Error("should not create");
      },
      updateQuizTask: async (taskId) => {
        updatedId = taskId;
        return sampleTask;
      },
      revalidatePath: () => undefined,
      invalidateCatalogCache: () => undefined,
    },
  );

  assert.equal(updatedId, 10);
  assert.equal(state.status, "success");
  if (state.status === "success") assert.equal(state.mode, "update");
});

test("saveQuizTaskAction forbids non-admin", async () => {
  const state = await saveQuizTaskAction(
    { status: "idle" },
    form({
      name: "A",
      taskText: "B",
      themeId: "1",
      answer1: "1",
      answer2: "2",
      answer3: "3",
      answer4: "4",
      rightAnswerN: "1",
      difficulty: "1",
    }),
    {
      requireUser: async () => student,
      createQuizTask: async () => sampleTask,
      updateQuizTask: async () => sampleTask,
      revalidatePath: () => undefined,
      invalidateCatalogCache: () => undefined,
    },
  );
  assert.deepEqual(state, { status: "error", code: "forbidden" });
});

test("deleteQuizTaskAction maps in_use", async () => {
  const state = await deleteQuizTaskAction(
    { status: "idle" },
    form({ taskId: "10" }),
    {
      requireUser: async () => admin,
      deleteQuizTask: async () => {
        throw new AdminContentError("in use", "in_use");
      },
      revalidatePath: () => undefined,
      invalidateCatalogCache: () => undefined,
    },
  );
  assert.deepEqual(state, { status: "error", code: "in_use" });
});

test("deleteQuizTasksAction deletes the posted ids and reports the count", async () => {
  const data = new FormData();
  data.append("taskId", "10");
  data.append("taskId", "11");
  let received: number[] = [];
  const state = await deleteQuizTasksAction({ status: "idle" }, data, {
    requireUser: async () => admin,
    deleteQuizTasks: async (ids) => {
      received = ids;
      return ids.length;
    },
    revalidatePath: () => undefined,
    invalidateCatalogCache: () => undefined,
  });
  assert.deepEqual(received, [10, 11]);
  assert.deepEqual(state, { status: "success", count: 2 });
});

test("updateThemeDifficultyGuideAction stores the legend for the theme", async () => {
  let received: { themeId: number; guide: string } | null = null;
  const state = await updateThemeDifficultyGuideAction(2, "1. Додавання.", {
    requireUser: async () => admin,
    updateThemeDifficultyGuide: async (themeId, guide) => {
      received = { themeId, guide };
    },
    revalidatePath: () => undefined,
    invalidateCatalogCache: () => undefined,
  });
  assert.deepEqual(received, { themeId: 2, guide: "1. Додавання." });
  assert.deepEqual(state, { status: "success" });
});

test("saveQuizTaskAction passes parameter drafts, last value wins", async () => {
  const data = form({
    taskText: "1/2 + 1/3",
    themeId: "5",
    answer1: "5/6",
    answer2: "2/5",
    answer3: "1/6",
    answer4: "2/3",
    rightAnswerN: "1",
    difficulty: "2",
  });
  data.append("param.4", "0");
  data.append("param.4", "1");
  data.set("param.5", "3");
  let drafts: { paramId: number; raw: string }[] | undefined;
  const state = await saveQuizTaskAction({ status: "idle" }, data, {
    requireUser: async () => admin,
    createQuizTask: async (input) => {
      drafts = input.paramDrafts;
      return sampleTask;
    },
    updateQuizTask: async () => sampleTask,
    revalidatePath: () => undefined,
    invalidateCatalogCache: () => undefined,
  });
  assert.equal(state.status, "success");
  assert.deepEqual(drafts, [
    { paramId: 4, raw: "1" },
    { paramId: 5, raw: "3" },
  ]);
});

test("deleteThemeParamAction deletes for staff and refuses a teacher", async () => {
  let received: { themeId: number; paramId: number } | null = null;
  const saved = await deleteThemeParamAction(
    { status: "idle" },
    form({ themeId: "5", paramId: "8" }),
    {
      requireUser: async () => admin,
      deleteThemeParam: async (themeId, paramId) => {
        received = { themeId, paramId };
        return { usageCount: 2 };
      },
      revalidatePath: () => undefined,
      invalidateCatalogCache: () => undefined,
    },
  );
  assert.deepEqual(received, { themeId: 5, paramId: 8 });
  assert.deepEqual(saved, { status: "success" });

  const teacher = { ...student, id: 2, role: "teacher" as const };
  const refused = await deleteThemeParamAction(
    { status: "idle" },
    form({ themeId: "5", paramId: "8" }),
    {
      requireUser: async () => teacher,
      deleteThemeParam: async () => {
        throw new Error("should not delete");
      },
      revalidatePath: () => undefined,
      invalidateCatalogCache: () => undefined,
    },
  );
  assert.deepEqual(refused, { status: "error", code: "forbidden" });
});

test("deleteQuizTasksAction rejects an empty selection", async () => {
  const state = await deleteQuizTasksAction(
    { status: "idle" },
    new FormData(),
    {
      requireUser: async () => admin,
      deleteQuizTasks: async () => 0,
      revalidatePath: () => undefined,
      invalidateCatalogCache: () => undefined,
    },
  );
  assert.deepEqual(state, { status: "error", code: "invalid_input" });
});

test("generateSimilarTasksAction saves only the drafts the checker kept", async () => {
  const saved: number[] = [];
  const state = await generateSimilarTasksAction(
    { status: "idle" },
    form({ taskId: "10", count: "2" }),
    {
      requireUser: async () => admin,
      getQuizTaskById: async () => sampleTask,
      generateDrafts: async () => ({
        drafts: [
          {
            name: "Нова",
            taskText: "Скільки буде 9 + 2?",
            themeId: 2,
            answer1: "10",
            answer2: "11",
            answer3: "12",
            answer4: "13",
            rightAnswerN: 2,
            comments: "",
            difficulty: 3,
            hintShort: "Додай до десяти.",
          },
        ],
        discarded: 1,
      }),
      insertGeneratedDrafts: async () => {
        saved.push(1);
        return [41];
      },
      llmReady: () => true,
      complete: async () => "",
      revalidatePath: () => undefined,
      invalidateCatalogCache: () => undefined,
    },
  );
  assert.deepEqual(saved, [1]);
  assert.deepEqual(state, { status: "success", saved: 1, discarded: 1 });
});

test("generateSimilarTasksAction stays closed without a model key", async () => {
  const state = await generateSimilarTasksAction(
    { status: "idle" },
    form({ taskId: "10", count: "1" }),
    {
      requireUser: async () => admin,
      getQuizTaskById: async () => {
        throw new Error("should not load");
      },
      generateDrafts: async () => {
        throw new Error("should not generate");
      },
      insertGeneratedDrafts: async () => {
        throw new Error("should not insert");
      },
      llmReady: () => false,
      complete: async () => "",
      revalidatePath: () => undefined,
      invalidateCatalogCache: () => undefined,
    },
  );
  assert.deepEqual(state, { status: "error", code: "llm" });
});

test("publishQuizTaskAction publishes one task", async () => {
  let published = 0;
  const state = await publishQuizTaskAction({ status: "idle" }, form({ taskId: "10" }), {
    requireUser: async () => admin,
    publishQuizTask: async (taskId) => {
      published = taskId;
    },
    revalidatePath: () => undefined,
    invalidateCatalogCache: () => undefined,
  });
  assert.equal(published, 10);
  assert.deepEqual(state, { status: "success", taskId: 10 });
});
