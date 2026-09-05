import {
  MAX_LEN_COMMENTS,
  MAX_LEN_TEXT,
  MAX_LEN_THEME_CODE,
  MAX_LEN_VARCHAR_50,
  MAX_LEN_VARCHAR_100,
  MAX_RIGHT_ANSWER,
  MIN_RIGHT_ANSWER,
  QUIZ_TASKS_COLUMNS,
  THEMES_COLUMNS,
  THEMES_REQUIRED_COLUMNS,
  THEME_CODE_PATTERN,
  THEME_CONNECTIONS_COLUMNS,
} from "./schema";
import { readInt, readString } from "./normalize";

/** One record's raw field values, plus a human-readable label for error messages. */
export type RawRow = { rowLabel: string; raw: Record<string, unknown> };

export type ThemeRecord = {
  id: number;
  code: string;
  name: string;
  description: string;
  ord: number;
};

export type ThemeConnectionRecord = {
  id: number;
  vertexStart: number;
  vertexFinish: number;
};

export type QuizTaskRecord = {
  id: number;
  name: string;
  taskText: string;
  themeId: number;
  answer1: string;
  answer2: string;
  answer3: string;
  answer4: string;
  rightAnswerN: number;
  comments: string;
};

function checkKeys(
  raw: Record<string, unknown>,
  requiredColumns: readonly string[],
  rowLabel: string,
  errors: string[],
  allowedColumns: readonly string[] = requiredColumns,
): boolean {
  const allowed = new Set<string>(allowedColumns);
  const present = Object.keys(raw);
  const unknown = present.filter((key) => !allowed.has(key));
  const missing = requiredColumns.filter((column) => !(column in raw));
  if (unknown.length > 0) {
    errors.push(`${rowLabel}: unknown field(s): ${unknown.join(", ")}`);
  }
  if (missing.length > 0) {
    errors.push(`${rowLabel}: missing field(s): ${missing.join(", ")}`);
  }
  return unknown.length === 0 && missing.length === 0;
}

function validateThemeRow(
  row: RawRow,
): { record?: ThemeRecord; errors: string[] } {
  const errors: string[] = [];

  if (
    !checkKeys(
      row.raw,
      THEMES_REQUIRED_COLUMNS,
      row.rowLabel,
      errors,
      THEMES_COLUMNS,
    )
  ) {
    return { errors };
  }

  const id = readInt(row.raw.id, "positive");
  const name = readString(row.raw.name, MAX_LEN_VARCHAR_100);
  const description = readString(row.raw.description, MAX_LEN_TEXT);
  // `ord` is an ordinal position; 0 is a valid first index, only negative values are rejected.
  const ord = readInt(row.raw.ord, "nonNegative");
  const rawCode = row.raw.code;

  let code: string | undefined;

  if (
    rawCode === undefined ||
    (typeof rawCode === "string" && rawCode.trim().length === 0)
  ) {
    if (id.value !== undefined) {
      code = `T-${id.value}`;
    }
  } else {
    const parsedCode = readString(rawCode, MAX_LEN_THEME_CODE);

    if (parsedCode.error) {
      errors.push(`${row.rowLabel}: code ${parsedCode.error}`);
    } else {
      code = parsedCode.value;
    }
  }

  if (id.error) errors.push(`${row.rowLabel}: id ${id.error}`);
  if (name.error) errors.push(`${row.rowLabel}: name ${name.error}`);
  if (description.error) {
    errors.push(`${row.rowLabel}: description ${description.error}`);
  }
  if (ord.error) errors.push(`${row.rowLabel}: ord ${ord.error}`);

  if (code && !THEME_CODE_PATTERN.test(code)) {
    errors.push(
      `${row.rowLabel}: code must contain only uppercase Latin letters, numbers, and hyphens`,
    );
  }

  if (errors.length > 0 || !code) {
    return { errors };
  }

  return {
    record: {
      id: id.value!,
      code,
      name: name.value!,
      description: description.value!,
      ord: ord.value!,
    },
    errors: [],
  };
}

function validateThemeConnectionRow(
  row: RawRow,
): { record?: ThemeConnectionRecord; errors: string[] } {
  const errors: string[] = [];
  if (!checkKeys(row.raw, THEME_CONNECTIONS_COLUMNS, row.rowLabel, errors)) {
    return { errors };
  }

  const id = readInt(row.raw.id, "positive");
  const vertexStart = readInt(row.raw.vertex_start, "positive");
  const vertexFinish = readInt(row.raw.vertex_finish, "positive");

  if (id.error) errors.push(`${row.rowLabel}: id ${id.error}`);
  if (vertexStart.error) errors.push(`${row.rowLabel}: vertex_start ${vertexStart.error}`);
  if (vertexFinish.error) errors.push(`${row.rowLabel}: vertex_finish ${vertexFinish.error}`);

  if (errors.length > 0) return { errors };
  return {
    record: { id: id.value!, vertexStart: vertexStart.value!, vertexFinish: vertexFinish.value! },
    errors: [],
  };
}

function validateQuizTaskRow(row: RawRow): { record?: QuizTaskRecord; errors: string[] } {
  const errors: string[] = [];
  if (!checkKeys(row.raw, QUIZ_TASKS_COLUMNS, row.rowLabel, errors)) {
    return { errors };
  }

  const id = readInt(row.raw.id, "positive");
  const name = readString(row.raw.name, MAX_LEN_VARCHAR_100);
  const taskText = readString(row.raw.task_text, MAX_LEN_TEXT);
  const themeId = readInt(row.raw.theme_id, "positive");
  const answer1 = readString(row.raw.answer_1, MAX_LEN_VARCHAR_50);
  const answer2 = readString(row.raw.answer_2, MAX_LEN_VARCHAR_50);
  const answer3 = readString(row.raw.answer_3, MAX_LEN_VARCHAR_50);
  const answer4 = readString(row.raw.answer_4, MAX_LEN_VARCHAR_50);
  const rightAnswerN = readInt(row.raw.right_answer_n, "positive");
  const comments = readString(row.raw.comments, MAX_LEN_COMMENTS);

  if (id.error) errors.push(`${row.rowLabel}: id ${id.error}`);
  if (name.error) errors.push(`${row.rowLabel}: name ${name.error}`);
  if (taskText.error) errors.push(`${row.rowLabel}: task_text ${taskText.error}`);
  if (themeId.error) errors.push(`${row.rowLabel}: theme_id ${themeId.error}`);
  if (answer1.error) errors.push(`${row.rowLabel}: answer_1 ${answer1.error}`);
  if (answer2.error) errors.push(`${row.rowLabel}: answer_2 ${answer2.error}`);
  if (answer3.error) errors.push(`${row.rowLabel}: answer_3 ${answer3.error}`);
  if (answer4.error) errors.push(`${row.rowLabel}: answer_4 ${answer4.error}`);
  if (comments.error) errors.push(`${row.rowLabel}: comments ${comments.error}`);
  if (rightAnswerN.error) {
    errors.push(`${row.rowLabel}: right_answer_n ${rightAnswerN.error}`);
  } else if (
    rightAnswerN.value! < MIN_RIGHT_ANSWER ||
    rightAnswerN.value! > MAX_RIGHT_ANSWER
  ) {
    errors.push(
      `${row.rowLabel}: right_answer_n must be between ${MIN_RIGHT_ANSWER} and ${MAX_RIGHT_ANSWER}`,
    );
  }

  if (errors.length > 0) return { errors };
  return {
    record: {
      id: id.value!,
      name: name.value!,
      taskText: taskText.value!,
      themeId: themeId.value!,
      answer1: answer1.value!,
      answer2: answer2.value!,
      answer3: answer3.value!,
      answer4: answer4.value!,
      rightAnswerN: rightAnswerN.value!,
      comments: comments.value!,
    },
    errors: [],
  };
}

function findDuplicateIds(ids: number[], datasetLabel: string): string[] {
  const counts = new Map<number, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  const errors: string[] = [];
  for (const [id, count] of counts) {
    if (count > 1) errors.push(`${datasetLabel}: duplicate id ${id} (${count} occurrences)`);
  }
  return errors;
}

function findDuplicateCodes(
  codes: string[],
  datasetLabel: string,
): string[] {
  const counts = new Map<string, number>();

  for (const code of codes) {
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  const errors: string[] = [];

  for (const [code, count] of counts) {
    if (count > 1) {
      errors.push(
        `${datasetLabel}: duplicate code ${code} (${count} occurrences)`,
      );
    }
  }

  return errors;
}

export function validateThemesDataset(
  rows: RawRow[],
  datasetLabel = "themes",
): { records: ThemeRecord[]; errors: string[] } {
  if (rows.length === 0) return { records: [], errors: [`${datasetLabel}: dataset is empty`] };

  const records: ThemeRecord[] = [];
  const errors: string[] = [];
  for (const row of rows) {
    const result = validateThemeRow(row);
    if (result.record) records.push(result.record);
    errors.push(...result.errors);
  }
  errors.push(...findDuplicateIds(records.map((r) => r.id), datasetLabel));
  errors.push(...findDuplicateCodes(records.map((r) => r.code), datasetLabel));
  return { records, errors };
}

export function validateThemeConnectionsDataset(
  rows: RawRow[],
  datasetLabel = "themeConnections",
): { records: ThemeConnectionRecord[]; errors: string[] } {
  if (rows.length === 0) return { records: [], errors: [`${datasetLabel}: dataset is empty`] };

  const records: ThemeConnectionRecord[] = [];
  const errors: string[] = [];
  for (const row of rows) {
    const result = validateThemeConnectionRow(row);
    if (result.record) records.push(result.record);
    errors.push(...result.errors);
  }
  errors.push(...findDuplicateIds(records.map((r) => r.id), datasetLabel));
  return { records, errors };
}

export function validateQuizTasksDataset(
  rows: RawRow[],
  datasetLabel = "quizTasks",
): { records: QuizTaskRecord[]; errors: string[] } {
  if (rows.length === 0) return { records: [], errors: [`${datasetLabel}: dataset is empty`] };

  const records: QuizTaskRecord[] = [];
  const errors: string[] = [];
  for (const row of rows) {
    const result = validateQuizTaskRow(row);
    if (result.record) records.push(result.record);
    errors.push(...result.errors);
  }
  errors.push(...findDuplicateIds(records.map((r) => r.id), datasetLabel));
  return { records, errors };
}
