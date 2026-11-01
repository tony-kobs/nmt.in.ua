import type { SessionTaskOption, SessionTaskView } from "./types";

export type QuizTaskRow = {
  id: number | null;
  name?: string | null;
  task_text?: string | null;
  difficulty?: number | string | null;
  answer_1?: string | null;
  answer_2?: string | null;
  answer_3?: string | null;
  answer_4?: string | null;
  right_answer_n?: number | string | null;
  comments?: string | null;
  position?: number | string | null;
};

function asInt(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n)) return null;
  return n;
}

/**
 * Keeps the bank's answer number (1 = А) even when an empty option is hidden,
 * so the key stays on the same letter the student sees.
 */
export function mapQuizTaskRow(row: QuizTaskRow, position = 0): SessionTaskView {
  const id = asInt(row.id);
  const pos = asInt(row.position) ?? position;
  if (id == null || id <= 0) {
    return {
      id: 0,
      position: pos > 0 ? pos : position,
      name: "",
      prompt: "",
      difficulty: 0,
      options: [],
      correctNumber: null,
      explanation: "",
      missing: true,
    };
  }

  const options: SessionTaskOption[] = [
    row.answer_1,
    row.answer_2,
    row.answer_3,
    row.answer_4,
  ].flatMap((text, index) => {
    const trimmed = (text ?? "").trim();
    if (!trimmed) return [];
    return [{ number: index + 1, text: trimmed }];
  });

  const correct = asInt(row.right_answer_n);
  const correctNumber =
    correct != null && correct >= 1 && correct <= 4 ? correct : null;

  return {
    id,
    position: pos > 0 ? pos : position,
    name: (row.name ?? "").trim(),
    prompt: (row.task_text ?? "").trim(),
    difficulty: Math.max(0, asInt(row.difficulty) ?? 0),
    options,
    correctNumber,
    explanation: (row.comments ?? "").trim(),
    missing: false,
  };
}

/** Drop duplicates, keep the first occurrence. `null` when the list is too long or has a bad id. */
export function parseTaskIdList(
  values: readonly unknown[],
  max: number,
): number[] | null {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const value of values) {
    const id = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(id) || id <= 0) return null;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  if (out.length > max) return null;
  return out;
}

export function buildSessionTitle(themeName: string, difficulty: number): string {
  const name = themeName.trim() || "Тема";
  const title = `${name} · рівень ${difficulty}`;
  return title.length <= 160 ? title : title.slice(0, 160);
}

export function likeContains(raw: string): string {
  const trimmed = raw.trim().slice(0, 80);
  const escaped = trimmed.replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}
