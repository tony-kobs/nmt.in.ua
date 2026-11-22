import { resolveNmtMatch, type NmtMatchView } from "@/modules/testing/nmtMatch";
import { normalizeNmtRichText } from "@/modules/testing/normalizeNmtRichText";

const OPTION_LETTERS = ["А", "Б", "В", "Г", "Д"] as const;

export type PublicSampleOption = {
  letter: string;
  text: string;
};

export type PublicSampleTask = {
  id: number;
  kind: "mcq" | "match" | "open";
  prompt: string;
  options: PublicSampleOption[];
  match: NmtMatchView | null;
  sourceLabel: string;
  sourceUrl: string | null;
};

export type SampleTaskRow = {
  id: number;
  name: string;
  task_text: string;
  answer_1: string | null;
  answer_2: string | null;
  answer_3: string | null;
  answer_4: string | null;
  answer_5: string | null;
  task_kind: string | null;
  source_url: string | null;
  year: number;
  label: string;
  source_note: string | null;
};

function httpsUrl(raw: string | null): string | null {
  const value = raw?.trim() ?? "";
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function sourceLabel(row: SampleTaskRow): string {
  const label = row.label.trim();
  const note = row.source_note?.trim() ?? "";
  const head = label ? `НМТ ${row.year} · ${label}` : `НМТ ${row.year}`;
  return note && note !== label ? `${head} · ${note}` : head;
}

/**
 * Read-only card. The key and the official solution (`comments`) never leave the server.
 */
export function presentSampleTask(row: SampleTaskRow): PublicSampleTask {
  const answers = [row.answer_1, row.answer_2, row.answer_3, row.answer_4, row.answer_5].map(
    (text) => normalizeNmtRichText(text ?? ""),
  );
  const match = resolveNmtMatch({
    name: row.name,
    taskText: row.task_text,
    taskKind: row.task_kind,
    answers: answers.map((text, index) => ({ number: index + 1, text })),
  });
  const kind = match ? "match" : row.task_kind === "open" ? "open" : "mcq";
  const options =
    kind === "mcq"
      ? answers.flatMap((text, index) => {
          const letter = OPTION_LETTERS[index];
          if (!letter || !text.trim()) return [];
          return [{ letter, text: text.trim() }];
        })
      : [];
  const prompt = normalizeNmtRichText(match ? match.stem : row.task_text).trim();
  return {
    id: row.id,
    kind,
    prompt,
    options,
    match: match?.match ?? null,
    sourceLabel: sourceLabel(row),
    sourceUrl: httpsUrl(row.source_url),
  };
}

/** First three distinct tasks, newest official variant first. */
export function pickSampleRows(rows: readonly SampleTaskRow[], limit = 3): SampleTaskRow[] {
  const seen = new Set<number>();
  const picked: SampleTaskRow[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    picked.push(row);
    if (picked.length >= limit) break;
  }
  return picked;
}
