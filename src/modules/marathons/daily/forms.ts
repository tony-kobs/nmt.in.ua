import { parseUnlockHour } from "./calendar";
import { isCopyKey, unknownPlaceholders, type CopyKey } from "./copy";
import { loomEmbedSrc, youtubeEmbedSrc } from "./richText";
import { normalizeCtaUrl, readUtm, serializeUtm, type UtmParams } from "./utm";

type DailyStatus = "draft" | "active" | "finished";
type MaterialType = "loom" | "youtube" | "text";

export function readText(raw: FormDataEntryValue | null, max: number): string {
  return String(raw ?? "").trim().slice(0, max);
}

export function readInt(raw: FormDataEntryValue | null): number | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isInteger(value) ? value : null;
}

export function isSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 64;
}

export function isDailyStatus(value: string): value is DailyStatus {
  return value === "draft" || value === "active" || value === "finished";
}

export type FieldIssue = {
  field: string;
  code: string;
};

export type AdminFormState = {
  status: "idle" | "error";
  issues: FieldIssue[];
};

export const IDLE_ADMIN_FORM: AdminFormState = { status: "idle", issues: [] };

export const DUPLICATE_SLUG: FieldIssue = { field: "slug", code: "duplicate" };
export const DUPLICATE_DAY: FieldIssue = { field: "dayNumber", code: "duplicate" };
export const DUPLICATE_ORDER: FieldIssue = { field: "order", code: "duplicate" };
export const FORM_SERVER: FieldIssue = { field: "form", code: "server" };
export const FORM_INVALID: FieldIssue = { field: "form", code: "invalid" };
export const QUESTION_MISSING: FieldIssue = { field: "questionId", code: "missing" };

export function adminFormError(issues: FieldIssue[]): AdminFormState {
  return { status: "error", issues };
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: FieldIssue[] };

function issue(issues: FieldIssue[], field: string, code: string) {
  if (!issues.some((item) => item.field === field)) issues.push({ field, code });
}

function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function readOrder(raw: FormDataEntryValue | null, issues: FieldIssue[]) {
  const order = readInt(raw);
  if (order == null) issue(issues, "order", "required");
  else if (order < 1 || order > 50) issue(issues, "order", "range");
  return order;
}

export type MarathonInput = {
  slug: string;
  title: string;
  subject: string;
  startDate: string;
  unlockHour: string;
  daysCount: number;
  passThreshold: number;
  finalCtaText: string;
  finalCtaUrl: string;
  introVideoUrl: string;
};

export function parseMarathonInput(formData: FormData): ParseResult<MarathonInput> {
  const issues: FieldIssue[] = [];
  const slug = readText(formData.get("slug"), 64).toLowerCase();
  const title = readText(formData.get("title"), 255);
  const subject = readText(formData.get("subject"), 64) || "math";
  const startDate = readText(formData.get("startDate"), 10);
  const unlockHour = readText(formData.get("unlockHour"), 5);
  const daysCount = readInt(formData.get("daysCount"));
  const passThreshold = readInt(formData.get("passThreshold"));
  const finalCtaText = readText(formData.get("finalCtaText"), 500);
  const finalCtaRaw = readText(formData.get("finalCtaUrl"), 500);
  const finalCtaUrl = normalizeCtaUrl(finalCtaRaw);
  const introVideoRaw = readText(formData.get("introVideoUrl"), 500);
  const introVideoUrl = introVideoRaw;
  if (!slug) issue(issues, "slug", "required");
  else if (!isSlug(slug)) issue(issues, "slug", "format");
  if (title.length < 2) issue(issues, "title", "required");
  if (!startDate) issue(issues, "startDate", "required");
  else if (!isIsoDate(startDate)) issue(issues, "startDate", "format");
  if (!unlockHour) issue(issues, "unlockHour", "required");
  else if (!parseUnlockHour(unlockHour)) issue(issues, "unlockHour", "format");
  if (daysCount == null || daysCount < 1 || daysCount > 14) {
    issue(issues, "daysCount", "range");
  }
  if (passThreshold == null || passThreshold < 0 || passThreshold > 100) {
    issue(issues, "passThreshold", "range");
  }
  if (!finalCtaText) issue(issues, "finalCtaText", "required");
  if (!finalCtaRaw) issue(issues, "finalCtaUrl", "required");
  else if (!finalCtaUrl) issue(issues, "finalCtaUrl", "format");
  if (introVideoRaw && !youtubeEmbedSrc(introVideoRaw) && !loomEmbedSrc(introVideoRaw)) {
    issue(issues, "introVideo", "format");
  }
  if (issues.length > 0 || !finalCtaUrl) return { ok: false, issues };
  return {
    ok: true,
    value: {
      slug,
      title,
      subject,
      startDate,
      unlockHour,
      daysCount: daysCount as number,
      passThreshold: passThreshold as number,
      finalCtaText,
      finalCtaUrl,
      introVideoUrl,
    },
  };
}

export type CopyFormInput = { key: CopyKey; body: string };

export function parseCopyInput(formData: FormData): ParseResult<CopyFormInput> {
  const issues: FieldIssue[] = [];
  const key = readText(formData.get("copyKey"), 64);
  const body = readText(formData.get("body"), 20_000);
  if (!isCopyKey(key)) issue(issues, "copyKey", "unknown");
  if (!body) issue(issues, "body", "required");
  else if (unknownPlaceholders(body).length > 0) issue(issues, "body", "placeholder");
  if (issues.length > 0 || !isCopyKey(key)) return { ok: false, issues };
  return { ok: true, value: { key, body } };
}

export type MaterialInput = { order: number; type: MaterialType; urlOrBody: string };

export function parseMaterial(formData: FormData): ParseResult<MaterialInput> {
  const issues: FieldIssue[] = [];
  const type = readText(formData.get("materialType"), 16);
  const urlOrBody = readText(formData.get("urlOrBody"), 20_000);
  const order = readOrder(formData.get("order"), issues);
  if (!urlOrBody) issue(issues, "urlOrBody", "required");
  else if (type === "youtube" && !youtubeEmbedSrc(urlOrBody)) {
    issue(issues, "urlOrBody", "youtube");
  } else if (type === "loom" && !loomEmbedSrc(urlOrBody)) {
    issue(issues, "urlOrBody", "loom");
  } else if (type !== "text" && type !== "youtube" && type !== "loom") {
    issue(issues, "urlOrBody", "required");
  }
  if (issues.length > 0 || order == null) return { ok: false, issues };
  return { ok: true, value: { order, type: type as MaterialType, urlOrBody } };
}

export type RiddleInput = {
  order: number;
  title: string;
  body: string;
  answer: string;
  hint: string | null;
};

export function parseRiddle(formData: FormData): ParseResult<RiddleInput> {
  const issues: FieldIssue[] = [];
  const order = readOrder(formData.get("order"), issues);
  const title = readText(formData.get("title"), 255);
  const body = readText(formData.get("body"), 8000);
  const answer = readText(formData.get("answer"), 512);
  const hint = readText(formData.get("hint"), 2000);
  if (title.length < 2) issue(issues, "title", "required");
  if (!body) issue(issues, "body", "required");
  if (!answer) issue(issues, "answer", "required");
  if (issues.length > 0 || order == null) return { ok: false, issues };
  return { ok: true, value: { order, title, body, answer, hint: hint || null } };
}

export type DayInput = { dayNumber: number; topic: string; introText: string | null };

export function parseDay(formData: FormData): ParseResult<DayInput> {
  const issues: FieldIssue[] = [];
  const dayNumber = readInt(formData.get("dayNumber"));
  const topic = readText(formData.get("topic"), 255);
  const introText = readText(formData.get("introText"), 4000);
  if (dayNumber == null) issue(issues, "dayNumber", "required");
  else if (dayNumber < 1 || dayNumber > 14) issue(issues, "dayNumber", "range");
  if (topic.length < 2) issue(issues, "topic", "required");
  if (issues.length > 0 || dayNumber == null) return { ok: false, issues };
  return { ok: true, value: { dayNumber, topic, introText: introText || null } };
}

export type DayUpdateInput = { topic: string; introText: string };

export function parseDayUpdate(formData: FormData): ParseResult<DayUpdateInput> {
  const issues: FieldIssue[] = [];
  const topic = readText(formData.get("topic"), 255);
  const introText = readText(formData.get("introText"), 4000);
  if (topic.length < 2) issue(issues, "topic", "required");
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: { topic, introText } };
}

export type TaskInput =
  | { order: number; mode: "bank"; questionId: number }
  | {
      order: number;
      mode: "inline";
      prompt: string;
      options: string[];
      correct: number;
      explanation: string | null;
    };

export function parseTask(formData: FormData): ParseResult<TaskInput> {
  const issues: FieldIssue[] = [];
  const order = readOrder(formData.get("order"), issues);
  const questionId = readInt(formData.get("questionId"));
  if (questionId != null && questionId > 0) {
    if (issues.length > 0 || order == null) return { ok: false, issues };
    return { ok: true, value: { order, mode: "bank", questionId } };
  }
  const prompt = readText(formData.get("prompt"), 4000);
  const options = [1, 2, 3, 4]
    .map((index) => readText(formData.get(`option${index}`), 500))
    .filter(Boolean);
  const correct = readInt(formData.get("correct"));
  if (!prompt) issue(issues, "prompt", "required");
  if (options.length < 2) issue(issues, "options", "required");
  if (correct == null || correct < 1 || correct > options.length) {
    issue(issues, "correct", "range");
  }
  if (issues.length > 0 || order == null || correct == null) return { ok: false, issues };
  const explanation = readText(formData.get("explanation"), 4000);
  return {
    ok: true,
    value: { order, mode: "inline", prompt, options, correct, explanation: explanation || null },
  };
}

export function utmFromForm(formData: FormData): UtmParams {
  return readUtm({
    utm_source: readText(formData.get("utm_source"), 80),
    utm_medium: readText(formData.get("utm_medium"), 80),
    utm_campaign: readText(formData.get("utm_campaign"), 80),
    utm_content: readText(formData.get("utm_content"), 80),
    utm_term: readText(formData.get("utm_term"), 80),
  });
}

export function utmJsonFromForm(formData: FormData): string | null {
  return serializeUtm(utmFromForm(formData));
}

export function answersFromForm(formData: FormData): Record<number, number> {
  const answers: Record<number, number> = {};
  for (const [key, value] of formData.entries()) {
    const match = /^task_(\d+)$/.exec(key);
    if (!match) continue;
    const taskId = Number(match[1]);
    const choice = Number(value);
    if (Number.isInteger(taskId) && Number.isInteger(choice) && choice > 0) {
      answers[taskId] = choice;
    }
  }
  return answers;
}

export function isDuplicateKey(error: unknown): boolean {
  return (error as { errno?: number }).errno === 1062;
}
