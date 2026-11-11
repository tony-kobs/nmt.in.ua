import type { DiscardReasons } from "./generateNotice";
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
  reasons: DiscardReasons;
};

/** The provider failed. The admin message is an API error, not a failed check. */
export class GenerateSimilarApiError extends Error {
  constructor() {
    super("llm_api");
    this.name = "GenerateSimilarApiError";
  }
}

class LlmRequestError extends Error {
  constructor(readonly status: number) {
    super("llm_http");
    this.name = "LlmRequestError";
  }
}

const GENERATE_SYSTEM = [
  "Ти складаєш нові тестові завдання з математики для банку.",
  "Мова умови і варіантів — та сама, що в зразку.",
  "Той самий тип: одне правильне з чотирьох варіантів.",
  "Не копіюй умову зразка. Зміни числа або ситуацію, щоб вийшла інша задача тієї самої ідеї.",
  "Чотири варіанти мають бути різними.",
  "rightAnswer — літера варіанта А, Б, В або Г, або текст правильного варіанта.",
  "Число можна записати з десятковою комою.",
  "hint — одне коротке речення, не довше за 160 символів. Це не розвʼязок, і в ньому немає правильної відповіді.",
  'Відповідай лише JSON: {"tasks":[{"taskText":"","answer1":"","answer2":"","answer3":"","answer4":"","rightAnswer":"Б","hint":""}]}',
].join("\n");

const SOLVE_SYSTEM = [
  "Розвʼяжи тестове завдання самостійно. Ключ тобі не дано.",
  "Не пояснюй кроки.",
  'Відповідай лише JSON: {"answer":"Б"} для літери варіанта або {"answer":"11,05"} для числа.',
  "Літера лише кирилична: А, Б, В або Г. Число можна з комою або крапкою.",
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

/** `$11{,}05$`, `11,05`, `11.05`, spaces and a trailing period are one number. */
function numericToken(value: string): number | null {
  let plain = value
    .replace(/\$/g, "")
    .replace(/\\,/g, ".")
    .replace(/\{[,.]\}/g, ".")
    .replace(/\s+/g, "")
    .replace(/,/g, ".");
  plain = plain.replace(/\.+$/g, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(plain)) return null;
  const parsed = Number(plain);
  return Number.isFinite(parsed) ? parsed : null;
}

function numbersClose(left: number, right: number): boolean {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= 1e-6 * scale;
}

function arithmeticPlain(taskText: string): string {
  return taskText
    .replace(/\$/g, " ")
    .replace(/\\,/g, ".")
    .replace(/\{[,.]\}/g, ".")
    .replace(/,/g, ".");
}

export type ArithmeticVerdict =
  | { kind: "match"; index: 1 | 2 | 3 | 4 }
  | { kind: "mismatch" }
  | { kind: "unknown" };

/**
 * One binary expression of two numbers, when the task is that expression.
 * A decimal comma, a dot, `$…$` and TeX `{,}` are the same number, including
 * trailing zeros. A unique option equal to the result is a match. A clear
 * result that is not among the options is a mismatch. Anything else stays unknown.
 */
export function arithmeticVerdict(
  taskText: string,
  answers: readonly string[],
): ArithmeticVerdict {
  const plain = arithmeticPlain(taskText);
  const expr = /(-?\d+(?:\.\d+)?)\s*([+\-−–*×x/÷:])\s*(-?\d+(?:\.\d+)?)/g;
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
    if (token != null && numbersClose(token, value)) hits.push(index + 1);
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
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function sameAnswer(left: string, right: string): boolean {
  const a = numericToken(left);
  const b = numericToken(right);
  if (a != null && b != null) return numbersClose(a, b);
  const foldedLeft = collapse(left);
  const foldedRight = collapse(right);
  return foldedLeft.length > 0 && foldedLeft === foldedRight;
}

function optionKey(answer: string): string {
  const token = numericToken(answer);
  if (token != null) return `n:${token.toFixed(6)}`;
  const folded = collapse(answer);
  return folded ? `s:${folded}` : "";
}

/**
 * A choice letter А–Г, the text of one option, or an index 1–4.
 * A number is the option value when it matches one option, not a forced letter.
 */
function resolveChoiceIndex(
  value: unknown,
  answers: readonly string[],
): 1 | 2 | 3 | 4 | null {
  const letter = cyrillicAnswerIndex(value);
  if (letter != null) return letter === 5 ? null : letter;

  const text =
    typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : "";
  if (!text) return null;
  const hits: number[] = [];
  answers.forEach((answer, index) => {
    if (index < 4 && sameAnswer(answer, text)) hits.push(index + 1);
  });
  if (hits.length > 1) return null;
  if (hits.length === 1) return hits[0] as 1 | 2 | 3 | 4;
  const index = numericToken(text);
  if (index != null && Number.isInteger(index) && index >= 1 && index <= 4) {
    return index as 1 | 2 | 3 | 4;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractJson(body: string): string | null {
  const start = body.search(/[[{]/);
  if (start < 0) return null;
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (let i = start; i < body.length; i += 1) {
    const ch = body[i]!;
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") {
      const open = stack.pop();
      const paired = (open === "{" && ch === "}") || (open === "[" && ch === "]");
      if (!paired) return null;
      if (stack.length === 0) return body.slice(start, i + 1);
    }
  }
  return null;
}

function parseJsonCandidate(body: string): unknown | undefined {
  const trimmed = body.trim();
  if (!trimmed) return undefined;
  try {
    const value = JSON.parse(trimmed) as unknown;
    if (typeof value === "string") {
      const nested = value.trim();
      if (nested.startsWith("{") || nested.startsWith("[")) {
        try {
          return JSON.parse(nested) as unknown;
        } catch {
          return value;
        }
      }
    }
    return value;
  } catch {
    const sliced = extractJson(trimmed);
    if (!sliced) return undefined;
    try {
      return JSON.parse(sliced) as unknown;
    } catch {
      return undefined;
    }
  }
}

/** Pull a JSON object or array out of a model reply, including a fenced block. */
export function parseModelJson(text: string): unknown {
  const trimmed = text.trim();
  const candidates: string[] = [];
  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]?.trim()) candidates.push(match[1].trim());
  }
  candidates.push(trimmed);
  for (const candidate of candidates) {
    const value = parseJsonCandidate(candidate);
    if (value !== undefined) return value;
  }
  throw new Error("json");
}

function taskItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  if (!record) return [];
  const tasks = record.tasks ?? record.items;
  return Array.isArray(tasks) ? tasks : [];
}

type TakenItem =
  | { draft: GeneratedDraft }
  | { reason: "shape" | "key" | "copy" | "options" | "validate" | "hint" };

/**
 * One model item becomes a draft only when validate.ts accepts it, the key
 * is a letter А–Г, an option value, or an index 1–4, the hint is short, and
 * the text is not a copy.
 */
function takeGeneratedItem(item: unknown, source: SimilarSource): TakenItem {
  const record = asRecord(item);
  if (!record) return { reason: "shape" };
  const taskText = readString(record, ["taskText", "task_text", "question"]);
  const answer1 = readString(record, ["answer1", "answer_1"]);
  const answer2 = readString(record, ["answer2", "answer_2"]);
  const answer3 = readString(record, ["answer3", "answer_3"]);
  const answer4 = readString(record, ["answer4", "answer_4"]);
  const answers = [answer1, answer2, answer3, answer4];
  const letter = resolveChoiceIndex(
    record.rightAnswer ?? record.right_answer ?? record.answer,
    answers,
  );
  if (letter == null) return { reason: "key" };
  if (collapse(taskText) === collapse(source.taskText)) return { reason: "copy" };
  const keys = answers.map(optionKey).filter(Boolean);
  if (new Set(keys).size !== 4) return { reason: "options" };

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
    return { reason: "validate" };
  }

  const correct = [parsed.answer1, parsed.answer2, parsed.answer3, parsed.answer4][
    parsed.rightAnswerN - 1
  ];
  const rawCorrect = answers[letter - 1] ?? "";
  const hint = acceptShortHint(
    readString(record, ["hint", "hintShort", "hint_short"]),
    correct ?? "",
  );
  if (!hint || leaksAnswer(hint, rawCorrect)) return { reason: "hint" };
  if (collapse(hint) === collapse(parsed.taskText)) return { reason: "hint" };

  return {
    draft: {
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
    },
  };
}

export function acceptGeneratedItem(
  item: unknown,
  source: SimilarSource,
): GeneratedDraft | null {
  const taken = takeGeneratedItem(item, source);
  return "draft" in taken ? taken.draft : null;
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

function solvedIndex(text: string, answers: readonly string[]): number | null {
  try {
    const payload = parseModelJson(text);
    const record = asRecord(payload);
    if (record) {
      return resolveChoiceIndex(record.answer ?? record.rightAnswer ?? record.letter, answers);
    }
    if (typeof payload === "string" || typeof payload === "number") {
      return resolveChoiceIndex(payload, answers);
    }
    return null;
  } catch {
    return resolveChoiceIndex(text, answers);
  }
}

async function answerConfirmed(
  draft: GeneratedDraft,
  complete: LlmComplete,
): Promise<boolean> {
  const answers = [draft.answer1, draft.answer2, draft.answer3, draft.answer4];
  const verdict = arithmeticVerdict(draft.taskText, answers);
  if (verdict.kind === "match") return verdict.index === draft.rightAnswerN;
  if (verdict.kind === "mismatch") return false;
  const reply = await complete(SOLVE_SYSTEM, solveUser(draft), { temperature: 0 });
  return solvedIndex(reply, answers) === draft.rightAnswerN;
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
function warnReject(taskId: number, reason: string): void {
  console.warn("generateSimilar rejected", { taskId, reason });
}

function apiFailureCode(error: unknown): string {
  if (error instanceof LlmRequestError) return `llm_http:${error.status}`;
  if (error instanceof Error) {
    if (
      error.message === "llm_http" ||
      error.message === "llm_empty" ||
      error.message === "llm_unconfigured"
    ) {
      return error.message;
    }
    if (error.name === "TimeoutError" || error.name === "AbortError") return "llm_timeout";
  }
  return "llm_failed";
}

function emptyResult(): GenerateSimilarResult {
  return { drafts: [], discarded: 0, reasons: { answer: 0, format: 0 } };
}

export async function generateSimilarDrafts(input: {
  source: SimilarSource;
  count: number;
  complete: LlmComplete;
}): Promise<GenerateSimilarResult> {
  const count = clampSimilarCount(input.count);
  if (count == null) return emptyResult();
  const taskId = input.source.id;
  const reasons: DiscardReasons = { answer: 0, format: 0 };
  let reply: string;
  try {
    reply = await input.complete(GENERATE_SYSTEM, generateUser(input.source, count), {
      temperature: 0.4,
    });
  } catch (error) {
    warnReject(taskId, `api:${apiFailureCode(error)}`);
    throw new GenerateSimilarApiError();
  }
  let payload: unknown;
  try {
    payload = parseModelJson(reply);
  } catch {
    reasons.format = count;
    warnReject(taskId, "format:not_json");
    return { drafts: [], discarded: count, reasons };
  }

  const items = taskItems(payload).slice(0, count);
  for (let missing = items.length; missing < count; missing += 1) {
    reasons.format += 1;
    warnReject(taskId, "format:short_reply");
  }
  const accepted: GeneratedDraft[] = [];
  for (const item of items) {
    const taken = takeGeneratedItem(item, input.source);
    if ("reason" in taken) {
      reasons.format += 1;
      warnReject(taskId, `format:${taken.reason}`);
      continue;
    }
    accepted.push(taken.draft);
  }

  const drafts: GeneratedDraft[] = [];
  for (const draft of accepted) {
    let ok = false;
    try {
      ok = await answerConfirmed(draft, input.complete);
    } catch (error) {
      warnReject(taskId, `api:${apiFailureCode(error)}`);
      throw new GenerateSimilarApiError();
    }
    if (ok) drafts.push(draft);
    else {
      reasons.answer += 1;
      warnReject(taskId, "answer_mismatch");
    }
  }
  return { drafts, discarded: reasons.answer + reasons.format, reasons };
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

/** Groq json_object mode rejects the call unless the prompt contains the word JSON. */
function withJsonCue(system: string, user: string): { system: string; user: string } {
  if (/\bjson\b/i.test(`${system}\n${user}`)) return { system, user };
  return { system: `${system}\nRespond with JSON.`, user };
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
    const prompted = withJsonCue(system, user);
    body = {
      model: config.model,
      temperature: options?.temperature ?? 0.4,
      // llama-3.3-70b-versatile on Groq accepts json_object, not json_schema.
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompted.system },
        { role: "user", content: prompted.user },
      ],
    };
  }

  const response = await fetchImpl(config.url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new LlmRequestError(response.status);
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
