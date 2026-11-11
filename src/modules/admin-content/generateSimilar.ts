import { parseAdminQuizTaskInput } from "./validate";
import type { TaskParamValue } from "./types";

export const SIMILAR_COUNT_MIN = 1;
export const SIMILAR_COUNT_MAX = 5;
const HINT_MAX = 160;

const ANSWER_LETTERS = ["А", "Б", "В", "Г", "Д"] as const;

export type SimilarSource = {
  id: number;
  themeId: number;
  difficulty: number;
  taskText: string;
  answer1: string;
  answer2: string;
  answer3: string;
  answer4: string;
  rightAnswerN: 1 | 2 | 3 | 4;
  params: readonly TaskParamValue[];
};

export type GeneratedDraft = {
  name: string;
  taskText: string;
  themeId: number;
  answer1: string;
  answer2: string;
  answer3: string;
  answer4: string;
  rightAnswerN: 1 | 2 | 3 | 4;
  comments: string;
  difficulty: number;
  hintShort: string;
};

export type LlmConfig = {
  apiKey: string;
  provider: string;
  model: string;
  url: string;
  kind: "openai" | "anthropic";
};

export type LlmComplete = (
  system: string,
  user: string,
  options?: { temperature?: number },
) => Promise<string>;

export type GenerateSimilarResult = {
  drafts: GeneratedDraft[];
  discarded: number;
};

const GENERATE_SYSTEM = [
  "Ти складаєш нові тестові завдання з математики для банку.",
  "Мова умови і варіантів — та сама, що в зразку.",
  "Той самий тип: одне правильне з чотирьох варіантів.",
  "Не копіюй умову зразка. Зміни числа або ситуацію, щоб вийшла інша задача тієї самої ідеї.",
  "Чотири варіанти мають бути різними.",
  "rightAnswer — одна кирилична літера: А, Б, В, Г або Д.",
  "hint — одне коротке речення, не довше за 160 символів. Це не розвʼязок, і в ньому немає правильної відповіді.",
  'Відповідай лише JSON: {"tasks":[{"taskText":"","answer1":"","answer2":"","answer3":"","answer4":"","rightAnswer":"Б","hint":""}]}',
].join("\n");

const SOLVE_SYSTEM = [
  "Розвʼяжи тестове завдання самостійно. Ключ тобі не дано.",
  "Не пояснюй кроки.",
  'Відповідай лише JSON: {"answer":"Б"}.',
  "Літера лише кирилична: А, Б, В, Г або Д.",
].join("\n");

/** 1–5, or null when the form value is not a count we accept. */
export function clampSimilarCount(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value.trim())
        : NaN;
  if (!Number.isInteger(numeric)) return null;
  if (numeric < SIMILAR_COUNT_MIN || numeric > SIMILAR_COUNT_MAX) return null;
  return numeric;
}

/** Cyrillic А–Д only. Latin letters and digits are refused. */
export function cyrillicAnswerIndex(value: unknown): 1 | 2 | 3 | 4 | 5 | null {
  if (typeof value !== "string") return null;
  const letter = value.trim().toLocaleUpperCase("uk");
  if (!/^[АБВГД]$/u.test(letter)) return null;
  const index = ANSWER_LETTERS.indexOf(letter as (typeof ANSWER_LETTERS)[number]);
  if (index < 0) return null;
  return (index + 1) as 1 | 2 | 3 | 4 | 5;
}

function collapse(value: string): string {
  return value.replace(/\$+/g, " ").replace(/\s+/g, " ").trim().toLocaleLowerCase("uk");
}

function numericToken(value: string): number | null {
  const plain = value.replace(/\$/g, "").replace(/\s+/g, "").replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(plain)) return null;
  const parsed = Number(plain);
  return Number.isFinite(parsed) ? parsed : null;
}

export type ArithmeticVerdict =
  | { kind: "match"; index: 1 | 2 | 3 | 4 }
  | { kind: "mismatch" }
  | { kind: "unknown" };

/**
 * One binary expression of two numbers, when the task is that expression.
 * A unique option equal to the result is a match. A clear result that is
 * not among the options is a mismatch. Anything else stays unknown.
 */
export function arithmeticVerdict(
  taskText: string,
  answers: readonly string[],
): ArithmeticVerdict {
  const plain = taskText.replace(/\$+/g, " ");
  const expr =
    /(-?\d+(?:[.,]\d+)?)\s*([+\-−–*×x/÷:])\s*(-?\d+(?:[.,]\d+)?)/g;
  const found = [...plain.matchAll(expr)];
  if (found.length !== 1) return { kind: "unknown" };
  const left = numericToken(found[0][1] ?? "");
  const right = numericToken(found[0][3] ?? "");
  const op = found[0][2] ?? "";
  if (left == null || right == null) return { kind: "unknown" };
  let value: number;
  if (op === "+") value = left + right;
  else if (op === "-" || op === "−" || op === "–") value = left - right;
  else if (op === "*" || op === "×" || op === "x" || op === "X") value = left * right;
  else if (op === "/" || op === "÷" || op === ":") {
    if (right === 0) return { kind: "unknown" };
    value = left / right;
  } else return { kind: "unknown" };

  const hits: number[] = [];
  answers.forEach((answer, index) => {
    const token = numericToken(answer);
    if (token != null && Math.abs(token - value) < 1e-9) hits.push(index + 1);
  });
  if (hits.length === 1 && hits[0]! >= 1 && hits[0]! <= 4) {
    return { kind: "match", index: hits[0] as 1 | 2 | 3 | 4 };
  }
  return { kind: "mismatch" };
}

function leaksAnswer(hint: string, answer: string): boolean {
  const foldedHint = collapse(hint);
  const foldedAnswer = collapse(answer);
  if (foldedAnswer.length < 2) return false;
  if (foldedAnswer.length < 4) {
    const escaped = foldedAnswer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`,
      "u",
    ).test(foldedHint);
  }
  return foldedHint.includes(foldedAnswer);
}

/** A short nudge. Empty, long, multi-step, or answer-leaking text is refused. */
export function acceptShortHint(value: unknown, correctAnswer: string): string | null {
  if (typeof value !== "string") return null;
  const hint = value.trim();
  if (!hint || hint.length > HINT_MAX) return null;
  const newlines = hint.match(/\n/g)?.length ?? 0;
  if (newlines > 1) return null;
  const stops = hint.match(/[.!?…]/g)?.length ?? 0;
  if (stops > 2) return null;
  if (leaksAnswer(hint, correctAnswer)) return null;
  return hint;
}

function readString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  return "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Pull a JSON object or array out of a model reply, including a fenced block. */
export function parseModelJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced?.[1] ?? trimmed).trim();
  try {
    return JSON.parse(body);
  } catch {
    const start = body.search(/[[{]/);
    if (start < 0) throw new Error("json");
    return JSON.parse(body.slice(start));
  }
}

function taskItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  if (!record) return [];
  const tasks = record.tasks ?? record.items;
  return Array.isArray(tasks) ? tasks : [];
}

/**
 * One model item becomes a draft only when validate.ts accepts it, the
 * letter is Cyrillic А–Д, the hint is short, and the text is not a copy.
 */
export function acceptGeneratedItem(
  item: unknown,
  source: SimilarSource,
): GeneratedDraft | null {
  const record = asRecord(item);
  if (!record) return null;
  const taskText = readString(record, ["taskText", "task_text", "question"]);
  const answer1 = readString(record, ["answer1", "answer_1"]);
  const answer2 = readString(record, ["answer2", "answer_2"]);
  const answer3 = readString(record, ["answer3", "answer_3"]);
  const answer4 = readString(record, ["answer4", "answer_4"]);
  const letter = cyrillicAnswerIndex(
    readString(record, ["rightAnswer", "right_answer", "answer"]),
  );
  if (letter == null) return null;
  if (collapse(taskText) === collapse(source.taskText)) return null;
  const answers = [answer1, answer2, answer3, answer4];
  if (new Set(answers.map(collapse).filter(Boolean)).size !== 4) return null;

  let parsed;
  try {
    parsed = parseAdminQuizTaskInput({
      taskText,
      themeId: source.themeId,
      answer1,
      answer2,
      answer3,
      answer4,
      rightAnswerN: letter,
      difficulty: source.difficulty,
      comments: "",
    });
  } catch {
    return null;
  }

  const correct = [parsed.answer1, parsed.answer2, parsed.answer3, parsed.answer4][
    parsed.rightAnswerN - 1
  ];
  const hint = acceptShortHint(
    readString(record, ["hint", "hintShort", "hint_short"]),
    correct ?? "",
  );
  if (!hint) return null;
  if (collapse(hint) === collapse(parsed.taskText)) return null;

  return {
    name: parsed.name,
    taskText: parsed.taskText,
    themeId: parsed.themeId,
    answer1: parsed.answer1,
    answer2: parsed.answer2,
    answer3: parsed.answer3,
    answer4: parsed.answer4,
    rightAnswerN: parsed.rightAnswerN as 1 | 2 | 3 | 4,
    comments: "",
    difficulty: parsed.difficulty,
    hintShort: hint,
  };
}

function solveUser(draft: GeneratedDraft): string {
  return [
    draft.taskText,
    `А) ${draft.answer1}`,
    `Б) ${draft.answer2}`,
    `В) ${draft.answer3}`,
    `Г) ${draft.answer4}`,
  ].join("\n");
}

function solvedIndex(text: string): number | null {
  let payload: unknown;
  try {
    payload = parseModelJson(text);
  } catch {
    return cyrillicAnswerIndex(text);
  }
  const record = asRecord(payload);
  if (!record) return null;
  return cyrillicAnswerIndex(record.answer ?? record.rightAnswer ?? record.letter);
}

async function answerConfirmed(
  draft: GeneratedDraft,
  complete: LlmComplete,
): Promise<boolean> {
  const verdict = arithmeticVerdict(draft.taskText, [
    draft.answer1,
    draft.answer2,
    draft.answer3,
    draft.answer4,
  ]);
  if (verdict.kind === "match") return verdict.index === draft.rightAnswerN;
  if (verdict.kind === "mismatch") return false;
  try {
    const reply = await complete(SOLVE_SYSTEM, solveUser(draft), { temperature: 0 });
    return solvedIndex(reply) === draft.rightAnswerN;
  } catch {
    return false;
  }
}

function generateUser(source: SimilarSource, count: number): string {
  const marks =
    source.params.length === 0
      ? "немає"
      : source.params.map((param) => `${param.paramId}=${param.intValue}`).join(", ");
  return [
    `Склади ${count} схожих завдань.`,
    `Складність: ${source.difficulty}.`,
    `Позначки параметрів, які треба зберегти за змістом: ${marks}.`,
    "Зразок:",
    source.taskText,
    `А) ${source.answer1}`,
    `Б) ${source.answer2}`,
    `В) ${source.answer3}`,
    `Г) ${source.answer4}`,
    `Правильна літера зразка: ${ANSWER_LETTERS[source.rightAnswerN - 1]}.`,
  ].join("\n");
}

/**
 * Ask for `count` tasks, keep those that pass validation and an independent
 * check, and report how many were thrown away.
 */
export async function generateSimilarDrafts(input: {
  source: SimilarSource;
  count: number;
  complete: LlmComplete;
}): Promise<GenerateSimilarResult> {
  const count = clampSimilarCount(input.count);
  if (count == null) return { drafts: [], discarded: 0 };
  let payload: unknown;
  try {
    const reply = await input.complete(
      GENERATE_SYSTEM,
      generateUser(input.source, count),
      { temperature: 0.4 },
    );
    payload = parseModelJson(reply);
  } catch {
    return { drafts: [], discarded: count };
  }

  const items = taskItems(payload).slice(0, count);
  let discarded = count - items.length;
  const accepted: GeneratedDraft[] = [];
  for (const item of items) {
    const draft = acceptGeneratedItem(item, input.source);
    if (!draft) {
      discarded += 1;
      continue;
    }
    accepted.push(draft);
  }

  const drafts: GeneratedDraft[] = [];
  for (const draft of accepted) {
    if (await answerConfirmed(draft, input.complete)) drafts.push(draft);
    else discarded += 1;
  }
  return { drafts, discarded };
}

function defaultModel(provider: string): string {
  if (provider === "anthropic") return "claude-3-5-haiku-latest";
  return "gpt-4o-mini";
}

function resolveEndpoint(
  provider: string,
  baseUrl: string | undefined,
): { kind: "openai" | "anthropic"; url: string } {
  if (provider === "anthropic") {
    const root = (baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
    if (root.endsWith("/messages")) return { kind: "anthropic", url: root };
    return { kind: "anthropic", url: `${root}/v1/messages` };
  }
  const defaults: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    openrouter: "https://openrouter.ai/api/v1",
    groq: "https://api.groq.com/openai/v1",
    together: "https://api.together.xyz/v1",
  };
  const root = (baseUrl || defaults[provider] || defaults.openai).replace(/\/$/, "");
  if (root.endsWith("/chat/completions")) return { kind: "openai", url: root };
  return { kind: "openai", url: `${root}/chat/completions` };
}

/** Null when `LLM_API_KEY` is empty: the admin button stays unmounted. */
export function readLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig | null {
  const apiKey = env.LLM_API_KEY?.trim() ?? "";
  if (!apiKey) return null;
  const provider = (env.LLM_PROVIDER?.trim() || "openai").toLowerCase();
  const model = env.LLM_MODEL?.trim() || defaultModel(provider);
  const endpoint = resolveEndpoint(provider, env.LLM_BASE_URL?.trim() || undefined);
  return { apiKey, provider, model, url: endpoint.url, kind: endpoint.kind };
}

export function llmConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return readLlmConfig(env) !== null;
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (typeof part === "object" && part !== null && "text" in part) {
        const text = (part as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      }
      return "";
    })
    .join("");
}

/** OpenAI-compatible chat completions, or Anthropic messages. No key in the body. */
export async function completeLlm(
  config: LlmConfig,
  system: string,
  user: string,
  options?: { temperature?: number },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  let body: Record<string, unknown>;
  if (config.kind === "anthropic") {
    headers["x-api-key"] = config.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    body = {
      model: config.model,
      max_tokens: 2500,
      temperature: options?.temperature ?? 0.4,
      system,
      messages: [{ role: "user", content: user }],
    };
  } else {
    headers.authorization = `Bearer ${config.apiKey}`;
    body = {
      model: config.model,
      temperature: options?.temperature ?? 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    };
  }

  const response = await fetchImpl(config.url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error("llm_http");
  const payload = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[];
    content?: unknown;
  };
  const text =
    config.kind === "anthropic"
      ? messageText(payload.content)
      : messageText(payload.choices?.[0]?.message?.content);
  if (!text.trim()) throw new Error("llm_empty");
  return text;
}
