import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { contentImportAction } from "./actions";
import type { ImportSummary } from "./index";
import type { AuthUser } from "@/modules/auth/types";

const ADMIN_USER: AuthUser = {
  id: 3,
  login: "demo-admin",
  displayName: "Адміністратор",
  role: "admin",
};

function adminDeps(overrides: {
  runContentImport?: typeof import("./index").runContentImport;
} = {}) {
  return {
    runContentImport: overrides.runContentImport ?? (async () => OK_SUMMARY),
    getCurrentUser: async () => ADMIN_USER,
    isContentImportConfigured: () =>
      Boolean(process.env.CONTENT_IMPORT_API_KEY?.trim()),
  };
}

const API_KEY = "test-secret-value";

function csvFile(name: string, content = "id,name,description,ord\n1,A,d,1\n") {
  return new File([content], name, { type: "text/csv" });
}

function validCsvFormData(): FormData {
  const formData = new FormData();
  formData.set("themes", csvFile("themes.csv"));
  formData.set("themeConnections", csvFile("theme_connections.csv", "id,vertex_start,vertex_finish\n"));
  formData.set("quizTasks", csvFile("quiz_tasks.csv", "id,name,task_text,theme_id,answer_1,answer_2,answer_3,answer_4,right_answer_n,comments\n"));
  return formData;
}

const OK_SUMMARY: ImportSummary = {
  inserted: { themes: 1, themeConnections: 0, quizTasks: 0, problems: 0 },
  updated: { themes: 0, themeConnections: 0, quizTasks: 0, problems: 0 },
  totalInserted: 1,
  totalUpdated: 0,
};

let originalApiKey: string | undefined;

beforeEach(() => {
  originalApiKey = process.env.CONTENT_IMPORT_API_KEY;
  process.env.CONTENT_IMPORT_API_KEY = API_KEY;
});

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.CONTENT_IMPORT_API_KEY;
  else process.env.CONTENT_IMPORT_API_KEY = originalApiKey;
});

test("contentImportAction returns unauthorized when CONTENT_IMPORT_API_KEY is unset", async () => {
  delete process.env.CONTENT_IMPORT_API_KEY;
  let called = false;
  const state = await contentImportAction({ status: "idle" }, validCsvFormData(), {
    ...adminDeps({
      runContentImport: async () => {
        called = true;
        return OK_SUMMARY;
      },
    }),
  });
  assert.equal(state.status, "unauthorized");
  assert.equal(called, false);
  if (state.status === "unauthorized") {
    assert.match(state.errors[0], /CONTENT_IMPORT_API_KEY/);
  }
});

test("contentImportAction returns success summary on valid CSV import", async () => {
  const state = await contentImportAction(
    { status: "idle" },
    validCsvFormData(),
    adminDeps({ runContentImport: async () => OK_SUMMARY }),
  );
  assert.equal(state.status, "success");
  if (state.status === "success") {
    assert.deepEqual(state.inserted, OK_SUMMARY.inserted);
    assert.equal(state.totalInserted, 1);
  }
});

test("contentImportAction returns validation errors as a list", async () => {
  const state = await contentImportAction(
    { status: "idle" },
    validCsvFormData(),
    adminDeps({
      runContentImport: async () => {
        const { ContentImportError } = await import("./errors");
        throw new ContentImportError("validation", ["themes row 2: id must be an integer"]);
      },
    }),
  );
  assert.equal(state.status, "error");
  if (state.status === "error") {
    assert.deepEqual(state.errors, ["themes row 2: id must be an integer"]);
  }
});

test("contentImportAction returns error for missing CSV fields without calling runContentImport", async () => {
  const formData = new FormData();
  formData.set("themes", csvFile("themes.csv"));
  let called = false;
  const state = await contentImportAction(
    { status: "idle" },
    formData,
    adminDeps({
      runContentImport: async () => {
        called = true;
        return OK_SUMMARY;
      },
    }),
  );
  assert.equal(state.status, "error");
  assert.equal(called, false);
  if (state.status === "error") {
    assert.ok(state.errors.some((e) => e.includes("themeConnections")));
  }
});
