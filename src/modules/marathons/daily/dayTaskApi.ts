import { planBankAdd, validateInlineEdit } from "./taskBank";

/** Same rules as the day editor. Does not write the question bank. */
export function dayTaskApiResponse(
  allowed: boolean,
  body: unknown,
): { status: number; json: unknown } {
  if (!allowed) return { status: 401, json: { ok: false, error: "forbidden" } };
  if (!body || typeof body !== "object") {
    return { status: 400, json: { ok: false, error: "invalid" } };
  }
  const record = body as Record<string, unknown>;
  if (record.action === "validate") {
    const checked = validateInlineEdit({
      prompt: typeof record.prompt === "string" ? record.prompt : "",
      options: Array.isArray(record.options) ? record.options.map((item) => String(item)) : [],
      correct: Number(record.correct),
      explanation: typeof record.explanation === "string" ? record.explanation : "",
    });
    return { status: checked.ok ? 200 : 400, json: checked };
  }
  if (record.action === "plan") {
    const incoming = Array.isArray(record.ids) ? record.ids.map((item) => Number(item)) : [];
    const here = Array.isArray(record.here) ? record.here.map((item) => Number(item)) : [];
    return { status: 200, json: { ok: true, ...planBankAdd(here, incoming, new Map()) } };
  }
  return { status: 400, json: { ok: false, error: "invalid" } };
}
