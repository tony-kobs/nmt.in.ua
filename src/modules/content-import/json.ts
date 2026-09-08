import type { RawRow } from "./validate";

export type ImportJsonDocument = {
  themes: RawRow[];
  themeConnections: RawRow[];
  quizTasks: RawRow[];
  problems: RawRow[];
};

const REQUIRED_TOP_LEVEL_KEYS = ["themes", "themeConnections", "quizTasks"] as const;
const OPTIONAL_TOP_LEVEL_KEYS = ["problems"] as const;
const KNOWN_TOP_LEVEL_KEYS = [
  ...REQUIRED_TOP_LEVEL_KEYS,
  ...OPTIONAL_TOP_LEVEL_KEYS,
] as const;

function toRawRows(value: unknown, datasetLabel: string, errors: string[]): RawRow[] {
  if (!Array.isArray(value)) {
    errors.push(`${datasetLabel}: expected an array`);
    return [];
  }
  const rows: RawRow[] = [];
  value.forEach((item, index) => {
    const rowLabel = `${datasetLabel}[${index}]`;
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      errors.push(`${rowLabel}: expected an object`);
      return;
    }
    rows.push({ rowLabel, raw: item as Record<string, unknown> });
  });
  return rows;
}

/**
 * Parses and structurally validates the single-document JSON import format:
 * `{ "themes": [...], "themeConnections": [...], "quizTasks": [...], "problems": [...] }`.
 * `problems` is optional — omit or `[]` to leave the workbook bank unchanged.
 * Per-field validation happens in `validate.ts`.
 */
export function parseImportJsonDocument(
  text: string,
): { document?: ImportJsonDocument; errors: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { errors: [`json: malformed JSON payload (${reason})`] };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { errors: ["json: expected a top-level object"] };
  }

  const obj = parsed as Record<string, unknown>;
  const errors: string[] = [];

  const unknownKeys = Object.keys(obj).filter(
    (key) => !(KNOWN_TOP_LEVEL_KEYS as readonly string[]).includes(key),
  );
  const missingKeys = REQUIRED_TOP_LEVEL_KEYS.filter((key) => !(key in obj));
  if (unknownKeys.length > 0) {
    errors.push(`json: unknown top-level field(s): ${unknownKeys.join(", ")}`);
  }
  if (missingKeys.length > 0) {
    errors.push(`json: missing top-level field(s): ${missingKeys.join(", ")}`);
  }
  if (errors.length > 0) return { errors };

  const themes = toRawRows(obj.themes, "themes", errors);
  const themeConnections = toRawRows(obj.themeConnections, "themeConnections", errors);
  const quizTasks = toRawRows(obj.quizTasks, "quizTasks", errors);
  const problems =
    obj.problems === undefined
      ? []
      : toRawRows(obj.problems, "problems", errors);

  if (errors.length > 0) return { errors };

  return { document: { themes, themeConnections, quizTasks, problems }, errors: [] };
}
