import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { ContentImportError, type ContentImportInput, type ImportSummary } from "@/modules/content-import";
import { MAX_TOTAL_UPLOAD_BYTES, MAX_REQUEST_BODY_BYTES } from "@/modules/content-import/schema";

const API_KEY = "test-secret-value";

function csvFile(name: string, content = "id,name,description,ord\n1,A,d,1\n") {
  return new File([content], name, { type: "text/csv" });
}

function requestWithFormData(
  formData: FormData,
  headers: Record<string, string> = { authorization: `Bearer ${API_KEY}` },
): NextRequest {
  return new NextRequest("http://localhost/api/import", { method: "POST", body: formData, headers });
}

function validCsvFormData(): FormData {
  const formData = new FormData();
  formData.set("themes", csvFile("themes.csv"));
  formData.set("themeConnections", csvFile("theme_connections.csv"));
  formData.set("quizTasks", csvFile("quiz_tasks.csv"));
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

// --- Authorization ---------------------------------------------------------

test("POST returns 401 when no Authorization header is sent", async () => {
  const response = await POST(requestWithFormData(validCsvFormData(), {}), undefined, {
    runContentImport: async () => OK_SUMMARY,
  });
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.deepEqual(body, { ok: false, errors: ["Unauthorized."] });
});

test("POST returns 401 for a wrong bearer credential", async () => {
  const response = await POST(
    requestWithFormData(validCsvFormData(), { authorization: "Bearer wrong-secret" }),
    undefined,
    { runContentImport: async () => OK_SUMMARY },
  );
  assert.equal(response.status, 401);
});

test("POST returns 401 and never calls runContentImport when CONTENT_IMPORT_API_KEY is unset (fail closed)", async () => {
  delete process.env.CONTENT_IMPORT_API_KEY;
  let called = false;
  const response = await POST(requestWithFormData(validCsvFormData()), undefined, {
    runContentImport: async () => {
      called = true;
      return OK_SUMMARY;
    },
  });
  assert.equal(response.status, 401);
  assert.equal(called, false);
});

test("POST does not echo the supplied credential back in the response body", async () => {
  const response = await POST(
    requestWithFormData(validCsvFormData(), { authorization: "Bearer wrong-secret-xyz" }),
    undefined,
    { runContentImport: async () => OK_SUMMARY },
  );
  const raw = await response.text();
  assert.ok(!raw.includes("wrong-secret-xyz"));
  assert.ok(!raw.includes(API_KEY));
});

test("POST accepts a valid Authorization header and proceeds", async () => {
  const response = await POST(requestWithFormData(validCsvFormData()), undefined, {
    runContentImport: async () => OK_SUMMARY,
  });
  assert.equal(response.status, 200);
});

// --- Content-Length pre-check -----------------------------------------------

test("POST proceeds when the declared Content-Length is above the 5 MiB file limit but at or below the request-body limit", async () => {
  const response = await POST(
    requestWithFormData(validCsvFormData(), {
      authorization: `Bearer ${API_KEY}`,
      // Above MAX_TOTAL_UPLOAD_BYTES (accounts for multipart boundaries/headers)
      // but still within MAX_REQUEST_BODY_BYTES: must not be rejected pre-parse.
      "content-length": String(MAX_REQUEST_BODY_BYTES),
    }),
    undefined,
    { runContentImport: async () => OK_SUMMARY },
  );
  assert.equal(response.status, 200);
});

test("POST returns 413 from a declared Content-Length above the request-body limit, without parsing the body or calling runContentImport", async () => {
  let called = false;
  const response = await POST(
    requestWithFormData(validCsvFormData(), {
      authorization: `Bearer ${API_KEY}`,
      "content-length": String(MAX_REQUEST_BODY_BYTES + 1),
    }),
    undefined,
    {
      runContentImport: async () => {
        called = true;
        return OK_SUMMARY;
      },
    },
  );
  assert.equal(response.status, 413);
  assert.equal(called, false);
});

test("POST treats a malformed Content-Length as absent and falls back to the post-parse size check", async () => {
  const response = await POST(
    requestWithFormData(validCsvFormData(), {
      authorization: `Bearer ${API_KEY}`,
      "content-length": "not-a-number",
    }),
    undefined,
    { runContentImport: async () => OK_SUMMARY },
  );
  assert.equal(response.status, 200);
});

test("POST treats a negative Content-Length as absent and falls back to the post-parse size check", async () => {
  const response = await POST(
    requestWithFormData(validCsvFormData(), {
      authorization: `Bearer ${API_KEY}`,
      "content-length": "-5",
    }),
    undefined,
    { runContentImport: async () => OK_SUMMARY },
  );
  assert.equal(response.status, 200);
});

test("POST still rejects an oversized upload via the post-parse File.size check when Content-Length is absent", async () => {
  const formData = new FormData();
  const oversized = new File([new Uint8Array(MAX_TOTAL_UPLOAD_BYTES + 1)], "import.json", {
    type: "application/json",
  });
  formData.set("file", oversized);
  formData.set("format", "json");

  const response = await POST(requestWithFormData(formData), undefined, {
    runContentImport: async () => OK_SUMMARY,
  });

  assert.equal(response.status, 413);
});

// --- Exact multipart shape ---------------------------------------------------

test("POST returns 400 when a required CSV field is missing", async () => {
  const formData = new FormData();
  formData.set("themes", csvFile("themes.csv"));
  formData.set("themeConnections", csvFile("theme_connections.csv"));
  // quizTasks omitted

  const response = await POST(requestWithFormData(formData), undefined, {
    runContentImport: async () => OK_SUMMARY,
  });

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.ok(body.errors[0].includes("quizTasks"));
});

test("POST returns 415 when the JSON field is present without format=json", async () => {
  const formData = new FormData();
  formData.set("file", new File(["{}"], "import.json", { type: "application/json" }));

  const response = await POST(requestWithFormData(formData), undefined, {
    runContentImport: async () => OK_SUMMARY,
  });

  assert.equal(response.status, 415);
});

test("POST returns 415 when the request matches neither accepted shape", async () => {
  const formData = new FormData();
  formData.set("unrelated", "value");

  const response = await POST(requestWithFormData(formData), undefined, {
    runContentImport: async () => OK_SUMMARY,
  });

  assert.equal(response.status, 415);
});

test("POST returns 400 and does not call runContentImport when JSON and CSV fields are mixed", async () => {
  const formData = validCsvFormData();
  formData.set("file", new File(["{}"], "import.json", { type: "application/json" }));
  formData.set("format", "json");

  let called = false;
  const response = await POST(requestWithFormData(formData), undefined, {
    runContentImport: async () => {
      called = true;
      return OK_SUMMARY;
    },
  });

  assert.equal(response.status, 400);
  assert.equal(called, false);
  const body = await response.json();
  assert.ok(body.errors[0].toLowerCase().includes("mix"));
});

test("POST returns 400 and does not call runContentImport for an unknown extra field", async () => {
  const formData = validCsvFormData();
  formData.set("extraField", "unexpected");

  let called = false;
  const response = await POST(requestWithFormData(formData), undefined, {
    runContentImport: async () => {
      called = true;
      return OK_SUMMARY;
    },
  });

  assert.equal(response.status, 400);
  assert.equal(called, false);
  const body = await response.json();
  assert.ok(body.errors[0].includes("extraField"));
});

test("POST returns 400 and does not call runContentImport for a duplicated form field", async () => {
  const formData = validCsvFormData();
  formData.append("themes", csvFile("themes-2.csv"));

  let called = false;
  const response = await POST(requestWithFormData(formData), undefined, {
    runContentImport: async () => {
      called = true;
      return OK_SUMMARY;
    },
  });

  assert.equal(response.status, 400);
  assert.equal(called, false);
  const body = await response.json();
  assert.ok(body.errors[0].includes("themes"));
});

test("POST returns 400 and does not call runContentImport for a duplicated JSON field", async () => {
  const formData = new FormData();
  formData.append("file", new File(["{}"], "a.json", { type: "application/json" }));
  formData.append("file", new File(["{}"], "b.json", { type: "application/json" }));
  formData.set("format", "json");

  let called = false;
  const response = await POST(requestWithFormData(formData), undefined, {
    runContentImport: async () => {
      called = true;
      return OK_SUMMARY;
    },
  });

  assert.equal(response.status, 400);
  assert.equal(called, false);
});

// --- Success paths -----------------------------------------------------------

test("POST returns 200 with the import summary for a valid CSV multipart request", async () => {
  let received: ContentImportInput | undefined;
  const response = await POST(requestWithFormData(validCsvFormData()), undefined, {
    runContentImport: async (input) => {
      received = input;
      return OK_SUMMARY;
    },
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { ok: true, ...OK_SUMMARY });
  assert.equal(received?.format, "csv");
});

test("POST returns 200 for a valid JSON multipart request", async () => {
  const formData = new FormData();
  formData.set("file", new File(["{}"], "import.json", { type: "application/json" }));
  formData.set("format", "json");

  let received: ContentImportInput | undefined;
  const response = await POST(requestWithFormData(formData), undefined, {
    runContentImport: async (input) => {
      received = input;
      return OK_SUMMARY;
    },
  });

  assert.equal(response.status, 200);
  assert.equal(received?.format, "json");
});

// --- Error mapping and log/response sanitization ------------------------------

test("POST maps a ContentImportError('validation') to 400 with its error list", async () => {
  const response = await POST(requestWithFormData(validCsvFormData()), undefined, {
    runContentImport: async () => {
      throw new ContentImportError("validation", ["themes row 2: id must be an integer"]);
    },
  });

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.deepEqual(body, { ok: false, errors: ["themes row 2: id must be an integer"] });
});

test("POST maps an unexpected error to 500 without leaking internal details in the response or the logs", async () => {
  const sensitive = "connect ECONNREFUSED 10.0.0.5:3306 user=root password=hunter2";
  const calls: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    calls.push(args);
  };

  let response: Response;
  try {
    response = await POST(requestWithFormData(validCsvFormData()), undefined, {
      runContentImport: async () => {
        throw new Error(sensitive);
      },
    });
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(response.status, 500);
  const body = await response.json();
  assert.deepEqual(body, { ok: false, errors: ["Internal server error."] });

  const loggedText = JSON.stringify(calls);
  for (const secret of ["hunter2", "root", "10.0.0.5", "3306", "ECONNREFUSED", sensitive]) {
    assert.ok(!loggedText.includes(secret), `expected log output to omit "${secret}"`);
  }
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ["content_import.route", "error:Error"]);
});
