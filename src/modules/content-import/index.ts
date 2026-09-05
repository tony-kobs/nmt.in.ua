/**
 * Module 2 — content import (CSV / JSON -> MySQL).
 *
 * `runContentImport` is the single entry point: it parses either three CSV
 * files or one JSON file into the three datasets (`themes`,
 * `themeConnections`, `quizTasks`), validates and normalizes every record,
 * then persists everything in one transaction via `importToDatabase`.
 *
 * HTTP wiring lives in `src/app/api/import/route.ts`.
 */
import { parseCsvDataset } from "./csv";
import { importToDatabase, type ImportSummary } from "./db";
import { ContentImportError } from "./errors";
import { parseImportJsonDocument } from "./json";
import {
  QUIZ_TASKS_COLUMNS,
  THEMES_COLUMNS,
  THEMES_REQUIRED_COLUMNS,
  THEME_CONNECTIONS_COLUMNS,
} from "./schema";
import {
  validateQuizTasksDataset,
  validateThemeConnectionsDataset,
  validateThemesDataset,
} from "./validate";

export { ContentImportError } from "./errors";
export type { ContentImportErrorKind } from "./errors";
export type { ImportSummary, DatasetCounts, ImportDatasets } from "./db";
export type { ThemeRecord, ThemeConnectionRecord, QuizTaskRecord } from "./validate";

export type ImportSource = File | string;

export type ContentImportInput =
  | {
      format: "csv";
      themes: ImportSource;
      themeConnections: ImportSource;
      quizTasks: ImportSource;
    }
  | { format: "json"; file: ImportSource };

async function readText(source: ImportSource): Promise<string> {
  return typeof source === "string" ? source : source.text();
}

async function buildCsvDatasets(input: {
  themes: ImportSource;
  themeConnections: ImportSource;
  quizTasks: ImportSource;
}) {
  const [themesText, themeConnectionsText, quizTasksText] = await Promise.all([
    readText(input.themes),
    readText(input.themeConnections),
    readText(input.quizTasks),
  ]);

  const themesParsed = parseCsvDataset(
    themesText,
    THEMES_COLUMNS,
    "themes",
    [THEMES_REQUIRED_COLUMNS],
  );
  const connectionsParsed = parseCsvDataset(
    themeConnectionsText,
    THEME_CONNECTIONS_COLUMNS,
    "themeConnections",
  );
  const quizTasksParsed = parseCsvDataset(quizTasksText, QUIZ_TASKS_COLUMNS, "quizTasks");

  const structuralErrors = [
    ...themesParsed.errors,
    ...connectionsParsed.errors,
    ...quizTasksParsed.errors,
  ];
  if (structuralErrors.length > 0) {
    throw new ContentImportError("validation", structuralErrors);
  }

  const themes = validateThemesDataset(themesParsed.rows);
  const themeConnections = validateThemeConnectionsDataset(connectionsParsed.rows);
  const quizTasks = validateQuizTasksDataset(quizTasksParsed.rows);

  const validationErrors = [
    ...themes.errors,
    ...themeConnections.errors,
    ...quizTasks.errors,
  ];
  if (validationErrors.length > 0) {
    throw new ContentImportError("validation", validationErrors);
  }

  return {
    themes: themes.records,
    themeConnections: themeConnections.records,
    quizTasks: quizTasks.records,
  };
}

async function buildJsonDatasets(input: { file: ImportSource }) {
  const text = await readText(input.file);
  const parsed = parseImportJsonDocument(text);
  if (!parsed.document) {
    throw new ContentImportError("validation", parsed.errors);
  }

  const themes = validateThemesDataset(parsed.document.themes, "themes");
  const themeConnections = validateThemeConnectionsDataset(
    parsed.document.themeConnections,
    "themeConnections",
  );
  const quizTasks = validateQuizTasksDataset(parsed.document.quizTasks, "quizTasks");

  const validationErrors = [
    ...themes.errors,
    ...themeConnections.errors,
    ...quizTasks.errors,
  ];
  if (validationErrors.length > 0) {
    throw new ContentImportError("validation", validationErrors);
  }

  return {
    themes: themes.records,
    themeConnections: themeConnections.records,
    quizTasks: quizTasks.records,
  };
}

type RunContentImportDeps = Parameters<typeof importToDatabase>[1];

/**
 * Parses, validates, and persists a content import. Throws
 * `ContentImportError` on any parsing/validation/database failure; callers
 * (the route handler) map `error.kind` to an HTTP status.
 */
export async function runContentImport(
  input: ContentImportInput,
  deps?: RunContentImportDeps,
): Promise<ImportSummary> {
  const datasets =
    input.format === "csv" ? await buildCsvDatasets(input) : await buildJsonDatasets(input);
  return deps ? importToDatabase(datasets, deps) : importToDatabase(datasets);
}
