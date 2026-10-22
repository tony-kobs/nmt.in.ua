import { resolveCopy, type CopyKey } from "./copy";
import { marathonCallbackFromText, isQuizKeyboardText } from "./botPlay";
import {
  accountCallbackFromText,
  MENU_CLOSE_LABEL,
  MENU_OPEN_LABEL,
} from "@/modules/telegram/replyKeyboard";

export type SurveyStatus = "active" | "done" | "skipped";
export type SurveyStep = "rating" | "improve" | "recommend";
export type SurveyRating = 1 | 2 | 3 | 4 | 5;

export type SurveyState = {
  status: SurveyStatus;
  step: SurveyStep;
  rating: SurveyRating | null;
  improve: string | null;
  recommend: boolean | null;
};

export type SurveyEvent =
  | { type: "rate"; rating: SurveyRating }
  | { type: "improve"; text: string }
  | { type: "recommend"; yes: boolean }
  | { type: "skip" };

export type SurveyPromptName = "rating" | "improve" | "recommend" | "thanks" | "skipped";

export type SurveyPrompt = {
  text: string;
  buttons: Array<{ text: string; data: string }>;
};

const UNLINK_LABELS = new Set([
  "Відв'язати",
  "Відв’язати",
  "Відв'язати Telegram",
  "Відв’язати Telegram",
]);

export function blankSurvey(): SurveyState {
  return { status: "active", step: "rating", rating: null, improve: null, recommend: null };
}

function clip(value: string): string {
  return Array.from(value.trim()).slice(0, 2000).join("");
}

/** A command or menu label is not the free-text answer. The survey stays on the same step. */
export function isSurveyNavigation(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/")) return true;
  if (trimmed.length > 64) return false;
  if (trimmed === MENU_OPEN_LABEL || trimmed === MENU_CLOSE_LABEL) return true;
  if (accountCallbackFromText(trimmed)) return true;
  if (marathonCallbackFromText(trimmed, undefined)) return true;
  if (isQuizKeyboardText(trimmed)) return true;
  return UNLINK_LABELS.has(trimmed);
}

export function readSurveyNote(update: unknown): { chatId: string; body: string; navigation: boolean } | null {
  if (!update || typeof update !== "object") return null;
  const message = (update as {
    message?: { chat?: { id?: number; type?: string }; from?: { id?: number }; text?: unknown; caption?: unknown };
  }).message;
  if (!message?.chat || !message.from || message.chat.type !== "private") return null;
  if (!Number.isSafeInteger(message.from.id) || Number(message.from.id) <= 0) return null;
  if (message.chat.id !== message.from.id) return null;
  const text = typeof message.text === "string" ? message.text.trim() : "";
  const caption = typeof message.caption === "string" ? message.caption.trim() : "";
  const raw = text || caption;
  if (!raw) return null;
  return { chatId: String(message.from.id), body: clip(raw), navigation: isSurveyNavigation(raw) };
}

/**
 * One step of the final survey.
 * Skip closes it and keeps whatever was already answered.
 * A step only accepts its own event.
 */
export function applySurvey(
  state: SurveyState,
  event: SurveyEvent,
): { state: SurveyState; prompt: SurveyPromptName } | null {
  if (state.status !== "active") return null;
  if (event.type === "skip") {
    return { state: { ...state, status: "skipped" }, prompt: "skipped" };
  }
  if (event.type === "rate" && state.step === "rating") {
    return {
      state: { ...state, rating: event.rating, step: "improve" },
      prompt: "improve",
    };
  }
  if (event.type === "improve" && state.step === "improve") {
    const text = clip(event.text);
    if (!text) return null;
    return {
      state: { ...state, improve: text, step: "recommend" },
      prompt: "recommend",
    };
  }
  if (event.type === "recommend" && state.step === "recommend") {
    return {
      state: { ...state, recommend: event.yes, status: "done", step: "recommend" },
      prompt: "thanks",
    };
  }
  return null;
}

function button(copy: Partial<Record<CopyKey, string>> | undefined, key: CopyKey): string {
  return resolveCopy(key, copy).trim().slice(0, 64) || resolveCopy(key, undefined).slice(0, 64);
}

export function surveyPrompt(
  name: SurveyPromptName,
  copy?: Partial<Record<CopyKey, string>>,
): SurveyPrompt {
  if (name === "rating") {
    return {
      text: resolveCopy("survey_rating", copy),
      buttons: [
        ...([1, 2, 3, 4, 5] as const).map((rating) => ({ text: String(rating), data: `mh:sv:${rating}` })),
        { text: button(copy, "survey_skip"), data: "mh:sv:x" },
      ],
    };
  }
  if (name === "improve") {
    return {
      text: resolveCopy("survey_improve", copy),
      buttons: [{ text: button(copy, "survey_skip"), data: "mh:sv:x" }],
    };
  }
  if (name === "recommend") {
    return {
      text: resolveCopy("survey_recommend", copy),
      buttons: [
        { text: button(copy, "survey_yes"), data: "mh:sv:y" },
        { text: button(copy, "survey_no"), data: "mh:sv:n" },
        { text: button(copy, "survey_skip"), data: "mh:sv:x" },
      ],
    };
  }
  if (name === "thanks") return { text: resolveCopy("survey_thanks", copy), buttons: [] };
  return { text: resolveCopy("survey_skipped", copy), buttons: [] };
}

export type SurveyAnswer = {
  marathonId: number;
  name: string;
  rating: number | null;
  improve: string | null;
  recommend: boolean | null;
  status: SurveyStatus;
};

export type SurveySummary = {
  average: number | null;
  count: number;
  recommendYes: number;
  recommendAnswered: number;
  answers: SurveyAnswer[];
  hidden: number;
};

const ANSWER_LIMIT = 20;

export function summarizeSurveys(rows: SurveyAnswer[]): Map<number, SurveySummary> {
  const grouped = new Map<number, SurveyAnswer[]>();
  for (const row of rows) {
    const list = grouped.get(row.marathonId) ?? [];
    list.push(row);
    grouped.set(row.marathonId, list);
  }
  const summaries = new Map<number, SurveySummary>();
  for (const [marathonId, list] of grouped) {
    const rated = list.filter((row) => row.rating != null);
    const sum = rated.reduce((total, row) => total + Number(row.rating), 0);
    const recommend = list.filter((row) => row.recommend != null);
    summaries.set(marathonId, {
      average: rated.length ? Math.round((sum / rated.length) * 10) / 10 : null,
      count: rated.length,
      recommendYes: recommend.filter((row) => row.recommend).length,
      recommendAnswered: recommend.length,
      answers: list.slice(0, ANSWER_LIMIT),
      hidden: Math.max(0, list.length - ANSWER_LIMIT),
    });
  }
  return summaries;
}
