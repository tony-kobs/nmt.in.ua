export const FEEDBACK_PROMPTED_KEY = "feedback_prompted_at";

type PromptLog = Record<string, number>;

export function parseFeedbackPromptLog(raw: string | null): PromptLog {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const record = parsed as Record<string, unknown>;
    if (typeof record.sessionId === "number" && typeof record.at === "number") {
      return { [String(record.sessionId)]: record.at };
    }
    const log: PromptLog = {};
    for (const [key, value] of Object.entries(record)) {
      if (typeof value === "number") {
        log[key] = value;
      }
    }
    return log;
  } catch {
    return {};
  }
}

export function wasFeedbackPrompted(
  raw: string | null,
  sessionId: number,
): boolean {
  return String(sessionId) in parseFeedbackPromptLog(raw);
}

export function appendFeedbackPrompt(
  raw: string | null,
  sessionId: number,
  at: number,
): string {
  const log = parseFeedbackPromptLog(raw);
  log[String(sessionId)] = at;
  return JSON.stringify(log);
}
