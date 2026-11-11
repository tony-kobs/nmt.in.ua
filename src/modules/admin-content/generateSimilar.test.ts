import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptGeneratedItem,
  acceptShortHint,
  arithmeticVerdict,
  clampSimilarCount,
  completeLlm,
  cyrillicAnswerIndex,
  generateSimilarDrafts,
  readLlmConfig,
  type LlmComplete,
  type SimilarSource,
} from "./generateSimilar";

const source: SimilarSource = {
  id: 9,
  themeId: 4,
  difficulty: 2,
  taskText: "Скільки буде 3 + 4?",
  answer1: "5",
  answer2: "7",
  answer3: "8",
  answer4: "12",
  rightAnswerN: 2,
  params: [{ paramId: 3, intValue: 2 }],
};

function item(overrides: Record<string, unknown> = {}) {
  return {
    taskText: "Скільки буде 8 + 5?",
    answer1: "12",
    answer2: "13",
    answer3: "14",
    answer4: "15",
    rightAnswer: "Б",
    hint: "Додай десяток і відніми одиницю.",
    ...overrides,
  };
}

test("the answer letter is a Cyrillic А–Д and nothing else", () => {
  assert.equal(cyrillicAnswerIndex("Б"), 2);
  assert.equal(cyrillicAnswerIndex(" д "), 5);
  assert.equal(cyrillicAnswerIndex("B"), null);
  assert.equal(cyrillicAnswerIndex("2"), null);
  assert.equal(cyrillicAnswerIndex("АБ"), null);
});

test("a short hint cannot carry the correct option or a write-up", () => {
  assert.equal(acceptShortHint("Додай десяток.", "13"), "Додай десяток.");
  assert.equal(acceptShortHint("Відповідь 13.", "13"), null);
  assert.equal(acceptShortHint("а".repeat(161), "13"), null);
  assert.equal(acceptShortHint("Крок 1. Крок 2. Крок 3.", "13"), null);
  assert.equal(acceptShortHint("", "13"), null);
});

test("plain arithmetic confirms the option that equals the result", () => {
  assert.deepEqual(arithmeticVerdict("Скільки буде 8 + 5?", ["12", "13", "14", "15"]), {
    kind: "match",
    index: 2,
  });
  assert.equal(
    arithmeticVerdict("Потім 2 + 3 і ще 4 + 1.", ["3", "5", "6", "7"]).kind,
    "unknown",
  );
  assert.equal(arithmeticVerdict("Скільки буде 8 + 5?", ["1", "2", "3", "4"]).kind, "mismatch");
});

test("acceptGeneratedItem keeps the source theme and difficulty and uses validate.ts", () => {
  const draft = acceptGeneratedItem(item(), source);
  assert.ok(draft);
  assert.equal(draft.themeId, 4);
  assert.equal(draft.difficulty, 2);
  assert.equal(draft.rightAnswerN, 2);
  assert.equal(draft.comments, "");
  assert.equal(draft.hintShort, "Додай десяток і відніми одиницю.");
});

test("a fifth letter, a copy, a latin key, and duplicate options are discarded", () => {
  assert.equal(acceptGeneratedItem(item({ rightAnswer: "Д" }), source), null);
  assert.equal(
    acceptGeneratedItem(item({ taskText: "Скільки буде 3 + 4?" }), source),
    null,
  );
  assert.equal(acceptGeneratedItem(item({ rightAnswer: "B" }), source), null);
  assert.equal(acceptGeneratedItem(item({ answer4: "12" }), source), null);
});

test("count is an integer from 1 to 5", () => {
  assert.equal(clampSimilarCount("3"), 3);
  assert.equal(clampSimilarCount(0), null);
  assert.equal(clampSimilarCount(6), null);
  assert.equal(clampSimilarCount("2.5"), null);
});

test("a matching arithmetic check does not ask the model to solve", async () => {
  const calls: string[] = [];
  const complete: LlmComplete = async (system, user) => {
    calls.push(system);
    if (calls.length === 1) {
      return JSON.stringify({ tasks: [item(), item({ rightAnswer: "А", hint: "Це не 13." })] });
    }
    return user;
  };
  const result = await generateSimilarDrafts({ source, count: 2, complete });
  assert.equal(calls.length, 1);
  assert.equal(result.drafts.length, 1);
  assert.equal(result.drafts[0]?.rightAnswerN, 2);
  assert.equal(result.discarded, 1);
});

test("an independent solve that disagrees is discarded", async () => {
  const sourceText: SimilarSource = {
    ...source,
    taskText: "Яке з чисел просте?",
    answer1: "4",
    answer2: "6",
    answer3: "9",
    answer4: "8",
  };
  let solves = 0;
  const complete: LlmComplete = async (system) => {
    if (solves === 0 && system.includes("складаєш")) {
      solves += 1;
      return JSON.stringify({
        tasks: [
          item({
            taskText: "Яке з чисел складене?",
            answer1: "4",
            answer2: "6",
            answer3: "9",
            answer4: "15",
            rightAnswer: "А",
            hint: "Подивись на дільники.",
          }),
        ],
      });
    }
    return JSON.stringify({ answer: "Г" });
  };
  const result = await generateSimilarDrafts({ source: sourceText, count: 1, complete });
  assert.deepEqual(result.drafts, []);
  assert.equal(result.discarded, 1);
});

test("an independent solve that agrees is kept", async () => {
  const word: SimilarSource = {
    ...source,
    taskText: "Яке з чисел просте?",
  };
  const complete: LlmComplete = async (system) => {
    if (system.includes("складаєш")) {
      return JSON.stringify({
        tasks: [
          item({
            taskText: "Яке з чисел складене?",
            answer1: "11",
            answer2: "13",
            answer3: "17",
            answer4: "15",
            rightAnswer: "Г",
            hint: "Подивись на дільники.",
          }),
        ],
      });
    }
    return JSON.stringify({ answer: "Г" });
  };
  const result = await generateSimilarDrafts({ source: word, count: 1, complete });
  assert.equal(result.drafts.length, 1);
  assert.equal(result.drafts[0]?.rightAnswerN, 4);
  assert.equal(result.discarded, 0);
});

test("a broken model reply discards the whole requested count", async () => {
  const complete: LlmComplete = async () => "не json";
  const result = await generateSimilarDrafts({ source, count: 3, complete });
  assert.deepEqual(result.drafts, []);
  assert.equal(result.discarded, 3);
});

test("the adapter reads the key, provider, and model, and stays off without a key", () => {
  const blank = { ...process.env };
  delete blank.LLM_API_KEY;
  assert.equal(readLlmConfig(blank), null);
  const openai = readLlmConfig({
    ...process.env,
    LLM_API_KEY: "secret-key",
    LLM_PROVIDER: "openai",
    LLM_MODEL: "gpt-test",
  });
  assert.equal(openai?.model, "gpt-test");
  assert.equal(openai?.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(openai?.kind, "openai");
  const anthropic = readLlmConfig({
    ...process.env,
    LLM_API_KEY: "secret-key",
    LLM_PROVIDER: "anthropic",
  });
  assert.equal(anthropic?.url, "https://api.anthropic.com/v1/messages");
  assert.equal(anthropic?.kind, "anthropic");
});

test("the HTTP call puts the key in a header and asks for JSON", async () => {
  const seen: { url: string; headers: Headers; body: string }[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    seen.push({
      url: String(url),
      headers: new Headers(init?.headers),
      body: String(init?.body ?? ""),
    });
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }] }),
      { status: 200 },
    );
  };
  const config = readLlmConfig({
    ...process.env,
    LLM_API_KEY: "secret-key",
    LLM_PROVIDER: "openai",
    LLM_MODEL: "gpt-test",
    LLM_BASE_URL: "",
  });
  assert.ok(config);
  const text = await completeLlm(config, "system", "user", undefined, fetchImpl);
  assert.equal(text, "{\"ok\":true}");
  assert.equal(seen[0]?.headers.get("authorization"), "Bearer secret-key");
  assert.equal(seen[0]?.body.includes("secret-key"), false);
  assert.match(seen[0]?.body ?? "", /json_object/);
  assert.equal(seen[0]?.url, "https://api.openai.com/v1/chat/completions");
});
