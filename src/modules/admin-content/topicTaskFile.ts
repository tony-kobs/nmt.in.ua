import ExcelJS from "exceljs";
import { parseCsvRecords } from "@/modules/marathons/daily/marathonCsv";
import {
  MAX_LEN_TEXT,
  MAX_LEN_VARCHAR_100,
  MAX_LEN_VARCHAR_255,
  MIN_DIFFICULTY,
} from "@/modules/content-import/schema";

export const TOPIC_TASK_FORMAT = "nmt-topic-tasks";
export const TOPIC_TASK_VERSION = 1;
export const MAX_HINT_SHORT = 280;

export const CORE_COLUMNS = [
  "id",
  "name",
  "task_text",
  "answer_1",
  "answer_2",
  "answer_3",
  "answer_4",
  "right_answer_n",
  "comments",
  "difficulty",
  "status",
  "hint_short",
] as const;

const STEPS = [
  "Файл містить усі завдання однієї теми.",
  "Порожній id створює завдання в цій темі. Наявний id цієї теми оновлює рядок.",
  "id з іншої теми або невідомий id — помилка, файл не записується.",
  "Формули й markdown лишайте як є.",
  "Статус: published або draft. Складність — ціле від 1. Правильна відповідь — номер 1–4.",
];

export type TopicParamSpec = {
  code: string;
  valueType: "bool" | "int";
};

export type TopicTaskFields = {
  name: string;
  taskText: string;
  answer1: string;
  answer2: string;
  answer3: string;
  answer4: string;
  rightAnswerN: number;
  comments: string;
  difficulty: number;
  status: "draft" | "published";
  hintShort: string;
  /** Null when the file has no parameter columns, so import leaves marks alone. */
  params: Record<string, number | null> | null;
};

export type ParsedTopicRow = {
  row: number;
  id: number | null;
  fields: TopicTaskFields;
};

export type TopicTaskIssue = { row: number; message: string };

export type StoredTopicTask = TopicTaskFields & { id: number };

export type TopicTaskPlan = {
  create: ParsedTopicRow[];
  update: ParsedTopicRow[];
  unchanged: number;
  deleteIds: number[];
  skipped: Array<{ id: number; reason: string }>;
  errors: TopicTaskIssue[];
};

function paramColumn(code: string): string {
  return `param:${code}`;
}

export function topicTaskColumns(params: readonly TopicParamSpec[]): string[] {
  return [...CORE_COLUMNS, ...params.map((param) => paramColumn(param.code))];
}

function cellsOf(task: StoredTopicTask, params: readonly TopicParamSpec[]): string[] {
  const base = [
    String(task.id),
    task.name,
    task.taskText,
    task.answer1,
    task.answer2,
    task.answer3,
    task.answer4,
    String(task.rightAnswerN),
    task.comments,
    String(task.difficulty),
    task.status,
    task.hintShort,
  ];
  return base.concat(params.map((param) => {
    const value = task.params?.[param.code];
    return value == null ? "" : String(value);
  }));
}

function csvCell(value: string): string {
  if (value.includes(";") || /["\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

/** Semicolon CSV. Cells are not rewritten, so a later import can match them. */
export function topicTasksToCsv(tasks: readonly StoredTopicTask[], params: readonly TopicParamSpec[]): string {
  const header = topicTaskColumns(params);
  const lines = [header, ...tasks.map((task) => cellsOf(task, params))]
    .map((row) => row.map(csvCell).join(";"));
  const notes = STEPS.map((step) => `# ${step}`).join("\r\n");
  return `\uFEFF${notes}\r\n${lines.join("\r\n")}`;
}

export function topicTasksToJson(tasks: readonly StoredTopicTask[], params: readonly TopicParamSpec[]): string {
  return JSON.stringify({
    format: TOPIC_TASK_FORMAT,
    version: TOPIC_TASK_VERSION,
    _instructions: STEPS,
    tasks: tasks.map((task) => ({
      id: task.id,
      name: task.name,
      task_text: task.taskText,
      answer_1: task.answer1,
      answer_2: task.answer2,
      answer_3: task.answer3,
      answer_4: task.answer4,
      right_answer_n: task.rightAnswerN,
      comments: task.comments,
      difficulty: task.difficulty,
      status: task.status,
      hint_short: task.hintShort,
      params: Object.fromEntries(params.map((param) => [param.code, task.params?.[param.code] ?? null])),
    })),
  }, null, 2);
}

export async function topicTasksToExcel(
  tasks: readonly StoredTopicTask[],
  params: readonly TopicParamSpec[],
): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook();
  const help = book.addWorksheet("Інструкція");
  help.addRows(STEPS.map((step) => [step]));
  const sheet = book.addWorksheet("Завдання");
  sheet.addRow(topicTaskColumns(params));
  for (const task of tasks) sheet.addRow(cellsOf(task, params));
  const buffer = await book.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function validateFields(
  raw: Record<string, string>,
  params: readonly TopicParamSpec[],
): { ok: true; fields: TopicTaskFields } | { ok: false; message: string } {
  const taskText = clean(raw.task_text);
  if (!taskText) return { ok: false, message: "Порожня умова." };
  if (taskText.length > MAX_LEN_TEXT) return { ok: false, message: "Умова задовга." };
  const name = clean(raw.name).slice(0, MAX_LEN_VARCHAR_100) || taskText.replace(/\$+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_LEN_VARCHAR_100);
  if (!name) return { ok: false, message: "Порожня назва." };
  const answers = [raw.answer_1, raw.answer_2, raw.answer_3, raw.answer_4].map(clean);
  if (answers.some((item) => !item)) return { ok: false, message: "Потрібні чотири варіанти відповіді." };
  if (answers.some((item) => item.length > MAX_LEN_VARCHAR_255)) {
    return { ok: false, message: "Варіант довший за 255 символів." };
  }
  const right = Number(clean(raw.right_answer_n));
  if (!Number.isInteger(right) || right < 1 || right > 4) {
    return { ok: false, message: "Правильна відповідь має бути числом від 1 до 4." };
  }
  const difficulty = Number(clean(raw.difficulty));
  if (!Number.isInteger(difficulty) || difficulty < MIN_DIFFICULTY) {
    return { ok: false, message: "Складність має бути цілим числом від 1." };
  }
  const status = clean(raw.status) || "published";
  if (status !== "draft" && status !== "published") {
    return { ok: false, message: "Статус має бути published або draft." };
  }
  const comments = clean(raw.comments);
  if (comments.length > 65535) return { ok: false, message: "Пояснення задовге." };
  const hint = clean(raw.hint_short);
  if (hint.length > MAX_HINT_SHORT) return { ok: false, message: "Коротка підказка довша за 280 символів." };
  const present = Object.keys(raw).filter((key) => key.startsWith("param:"));
  let paramValues: Record<string, number | null> | null = null;
  if (present.length > 0) {
    paramValues = {};
    const known = new Map(params.map((param) => [param.code, param]));
    for (const key of present) {
      const code = key.slice("param:".length);
      const spec = known.get(code);
      if (!spec) return { ok: false, message: `Невідомий параметр ${code}.` };
      const cell = clean(raw[key]);
      if (!cell) {
        paramValues[code] = null;
        continue;
      }
      const numeric = Number(cell);
      if (!Number.isInteger(numeric) || numeric < 0) {
        return { ok: false, message: `Параметр ${code} має бути цілим від нуля.` };
      }
      if (spec.valueType === "bool" && numeric !== 0 && numeric !== 1) {
        return { ok: false, message: `Параметр ${code} приймає лише 0 або 1.` };
      }
      paramValues[code] = numeric;
    }
  }
  return {
    ok: true,
    fields: {
      name,
      taskText,
      answer1: answers[0] ?? "",
      answer2: answers[1] ?? "",
      answer3: answers[2] ?? "",
      answer4: answers[3] ?? "",
      rightAnswerN: right,
      comments,
      difficulty,
      status,
      hintShort: hint,
      params: paramValues,
    },
  };
}

function rowFromRecord(record: Record<string, string>, row: number, params: readonly TopicParamSpec[]): ParsedTopicRow | TopicTaskIssue {
  const idText = clean(record.id);
  let id: number | null = null;
  if (idText) {
    const numeric = Number(idText);
    if (!Number.isInteger(numeric) || numeric <= 0) return { row, message: "id має бути додатним цілим або порожнім." };
    id = numeric;
  }
  const checked = validateFields(record, params);
  if (!checked.ok) return { row, message: checked.message };
  return { row, id, fields: checked.fields };
}

function recordsFromMatrix(
  matrix: string[][],
  params: readonly TopicParamSpec[],
): { rows: ParsedTopicRow[]; errors: TopicTaskIssue[] } {
  const header = (matrix[0] ?? []).map((cell) => cell.trim());
  if (!header.includes("task_text")) {
    return { rows: [], errors: [{ row: 1, message: "Немає колонки task_text." }] };
  }
  const rows: ParsedTopicRow[] = [];
  const errors: TopicTaskIssue[] = [];
  for (let index = 1; index < matrix.length; index += 1) {
    const line = matrix[index] ?? [];
    if (line.every((cell) => cell.trim() === "")) continue;
    const record: Record<string, string> = {};
    header.forEach((key, cell) => {
      if (key) record[key] = line[cell] ?? "";
    });
    const parsed = rowFromRecord(record, index + 1, params);
    if ("message" in parsed) errors.push(parsed);
    else rows.push(parsed);
  }
  return { rows, errors };
}

export function parseTopicTaskCsv(
  text: string,
  params: readonly TopicParamSpec[] = [],
): { rows: ParsedTopicRow[]; errors: TopicTaskIssue[] } {
  const parsed = parseCsvRecords(text);
  if (!parsed.ok) return { rows: [], errors: [{ row: 0, message: parsed.error }] };
  if ((parsed.rows[0]?.length ?? 0) <= 1 && (parsed.rows[0]?.[0] ?? "").includes(",")) {
    return { rows: [], errors: [{ row: 1, message: "Роздільник має бути ;" }] };
  }
  return recordsFromMatrix(parsed.rows, params);
}

export function parseTopicTaskJson(
  text: string,
  params: readonly TopicParamSpec[] = [],
): { rows: ParsedTopicRow[]; errors: TopicTaskIssue[] } {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { rows: [], errors: [{ row: 0, message: "JSON не прочитано." }] };
  }
  const record = body && typeof body === "object" ? body as Record<string, unknown> : null;
  const list = Array.isArray(body) ? body : record?.tasks;
  if (!Array.isArray(list)) return { rows: [], errors: [{ row: 0, message: "У JSON немає списку tasks." }] };
  const rows: ParsedTopicRow[] = [];
  const errors: TopicTaskIssue[] = [];
  list.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      errors.push({ row: index + 1, message: "Рядок завдання порожній." });
      return;
    }
    const source = item as Record<string, unknown>;
    const flat: Record<string, string> = {};
    for (const key of CORE_COLUMNS) flat[key] = clean(source[key]);
    const extra = source.params;
    if (extra && typeof extra === "object" && !Array.isArray(extra)) {
      for (const [code, value] of Object.entries(extra)) flat[`param:${code}`] = clean(value);
    }
    const parsed = rowFromRecord(flat, index + 1, params);
    if ("message" in parsed) errors.push(parsed);
    else rows.push(parsed);
  });
  return { rows, errors };
}

export async function parseTopicTaskExcel(
  bytes: Uint8Array,
  params: readonly TopicParamSpec[] = [],
): Promise<{ rows: ParsedTopicRow[]; errors: TopicTaskIssue[] }> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer);
  const sheet = book.getWorksheet("Завдання") ?? book.worksheets.find((item) => item.name !== "Інструкція");
  if (!sheet) return { rows: [], errors: [{ row: 0, message: "У книзі немає аркуша завдань." }] };
  const matrix: string[][] = [];
  sheet.eachRow((row) => {
    const values = row.values as unknown[];
    matrix.push(values.slice(1).map((cell) => clean(cell && typeof cell === "object" && "text" in cell ? (cell as { text: string }).text : cell)));
  });
  return recordsFromMatrix(matrix, params);
}

function sameCore(left: TopicTaskFields, right: TopicTaskFields): boolean {
  return left.name === right.name
    && left.taskText === right.taskText
    && left.answer1 === right.answer1
    && left.answer2 === right.answer2
    && left.answer3 === right.answer3
    && left.answer4 === right.answer4
    && left.rightAnswerN === right.rightAnswerN
    && left.comments === right.comments
    && left.difficulty === right.difficulty
    && left.status === right.status
    && left.hintShort === right.hintShort;
}

function sameParams(incoming: Record<string, number | null> | null, stored: Record<string, number | null> | null): boolean {
  if (!incoming) return true;
  return Object.entries(incoming).every(([code, value]) => (stored?.[code] ?? null) === value);
}

export function planTopicTasks(input: {
  rows: readonly ParsedTopicRow[];
  parseErrors: readonly TopicTaskIssue[];
  current: readonly StoredTopicTask[];
  foreignIds: ReadonlyMap<number, number>;
  protectedIds: ReadonlyMap<number, string>;
  deleteMissing: boolean;
}): TopicTaskPlan {
  const errors = [...input.parseErrors];
  const byId = new Map(input.current.map((task) => [task.id, task]));
  const seen = new Set<number>();
  const create: ParsedTopicRow[] = [];
  const update: ParsedTopicRow[] = [];
  let unchanged = 0;
  for (const row of input.rows) {
    if (row.id == null) {
      create.push(row);
      continue;
    }
    if (seen.has(row.id)) {
      errors.push({ row: row.row, message: `id ${row.id} повторюється у файлі.` });
      continue;
    }
    seen.add(row.id);
    const own = byId.get(row.id);
    if (!own) {
      const other = input.foreignIds.get(row.id);
      errors.push({
        row: row.row,
        message: other == null ? `Завдання ${row.id} немає в банку.` : `Завдання ${row.id} належить іншій темі.`,
      });
      continue;
    }
    if (sameCore(row.fields, own) && sameParams(row.fields.params, own.params)) unchanged += 1;
    else update.push(row);
  }
  const deleteIds: number[] = [];
  const skipped: Array<{ id: number; reason: string }> = [];
  if (input.deleteMissing) {
    for (const task of input.current) {
      if (seen.has(task.id)) continue;
      const reason = input.protectedIds.get(task.id);
      if (reason) skipped.push({ id: task.id, reason });
      else deleteIds.push(task.id);
    }
  }
  return { create, update, unchanged, deleteIds, skipped, errors };
}
