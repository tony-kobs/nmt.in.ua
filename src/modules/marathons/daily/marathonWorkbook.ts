import ExcelJS from "exceljs";
import { CSV_SAMPLE_SLUG, parseMarathonRecords, type CsvParseResult, type MarathonCsvColumn, type MarathonCsvDocument } from "./marathonCsv";
import { MARATHON_IMPORT_STEPS } from "./marathonImportGuide";

export const SHEET_MARATHON = "Марафон";
export const SHEET_DAYS = "Дні";
export const SHEET_MATERIALS = "Матеріали";
export const SHEET_TASKS = "Завдання";
export const SHEET_RIDDLES = "Загадки";
export const SHEET_GUIDE = "Інструкція";
export const SHEET_EXAMPLE = "Приклад";

const MAX_BYTES = 2_000_000;
const MAX_ROWS = 500;

const MARATHON_COLUMNS: Array<[string, MarathonCsvColumn]> = [
  ["адреса", "slug"],
  ["назва", "title"],
  ["предмет", "subject"],
  ["опис", "description"],
  ["статус", "status"],
  ["дата старту", "start_date"],
  ["година відкриття", "unlock_hour"],
  ["година нагадування", "reminder_hour"],
  ["пропуск від", "nudge_from"],
  ["пропуск до", "nudge_until"],
  ["днів", "days_count"],
  ["поріг", "pass_threshold"],
  ["текст кнопки", "final_cta_text"],
  ["посилання кнопки", "final_cta_url"],
  ["відео вступу", "intro_video_url"],
  ["кого сповістити", "invite_audience"],
  ["загадок на сторінці", "landing_riddle_count"],
  ["чат", "public_chat_url"],
];

const DAY_COLUMNS: Array<[string, MarathonCsvColumn]> = [
  ["номер", "day_number"],
  ["тема", "topic"],
  ["вступ", "intro_text"],
];

const MATERIAL_COLUMNS: Array<[string, MarathonCsvColumn]> = [
  ["день", "day_number"],
  ["порядок", "material_order"],
  ["тип", "material_type"],
  ["текст", "material_body"],
];

const TASK_COLUMNS: Array<[string, MarathonCsvColumn]> = [
  ["день", "day_number"],
  ["порядок", "task_order"],
  ["id завдання", "question_id"],
  ["формулювання", "inline_prompt"],
  ["варіанти", "inline_options"],
  ["правильна", "inline_correct"],
  ["пояснення", "inline_explanation"],
];

const RIDDLE_COLUMNS: Array<[string, MarathonCsvColumn]> = [
  ["предмет", "riddle_subject"],
  ["назва", "riddle_title"],
  ["текст", "riddle_body"],
  ["підказка", "riddle_hint"],
  ["варіанти", "riddle_options"],
  ["правильна", "riddle_correct"],
];

const COLUMN_NOTES: Partial<Record<MarathonCsvColumn, string>> = {
  slug: "Адреса латиницею, цифри і дефіс. pryklad — лише приклад, імпорт його пропускає.",
  title: "Назва, щонайменше 2 символи.",
  subject: "Предмет. Порожнє стає math.",
  description: "Опис до 2000 символів.",
  status: "draft, active, finished або archived. Новий курс усе одно стане чернеткою.",
  start_date: "Дата старту: РРРР-ММ-ДД.",
  unlock_hour: "Година відкриття, ГГ:ХХ.",
  reminder_hour: "Година нагадування, ГГ:ХХ.",
  nudge_from: "Година від 0 до 23. Має бути раніше за «пропуск до».",
  nudge_until: "Година від 0 до 23.",
  days_count: "Ціле від 1 до 14.",
  pass_threshold: "Ціле від 0 до 100.",
  final_cta_text: "Текст фінальної кнопки, обовʼязковий.",
  final_cta_url: "Посилання https або шлях від /.",
  intro_video_url: "YouTube або Loom. Можна порожньо.",
  invite_audience: "none, students або all.",
  landing_riddle_count: "Скільки загадок на сторінці, від 1 до 12.",
  public_chat_url: "Посилання чату, https або шлях. Можна порожньо.",
  day_number: "Номер дня від 1 до кількості днів марафону.",
  topic: "Тема дня, від 2 до 255 символів.",
  intro_text: "Вступ дня. Можна порожньо.",
  material_order: "Порядок матеріалу, від 1 до 50.",
  material_type: "text, youtube або loom.",
  material_body: "Текст або посилання матеріалу.",
  task_order: "Порядок завдання, від 1 до 50.",
  question_id: "Номер опублікованого завдання з банку. Порожньо, якщо своє формулювання.",
  inline_prompt: "Своє формулювання. Порожньо, якщо вказано id завдання.",
  inline_options: "2–4 варіанти через |.",
  inline_correct: "Номер правильного варіанта, з 1.",
  inline_explanation: "Пояснення. Можна порожньо.",
  riddle_subject: "Предмет загадки.",
  riddle_title: "Назва загадки.",
  riddle_body: "Текст загадки.",
  riddle_hint: "Підказка. Можна порожньо.",
  riddle_options: "2–6 варіантів через |.",
  riddle_correct: "Номер правильної відповіді, з 1.",
};

const SHEETS: Array<{ name: string; kind: string; columns: Array<[string, MarathonCsvColumn]> }> = [
  { name: SHEET_MARATHON, kind: "marathon", columns: MARATHON_COLUMNS },
  { name: SHEET_DAYS, kind: "day", columns: DAY_COLUMNS },
  { name: SHEET_MATERIALS, kind: "material", columns: MATERIAL_COLUMNS },
  { name: SHEET_TASKS, kind: "task", columns: TASK_COLUMNS },
  { name: SHEET_RIDDLES, kind: "riddle", columns: RIDDLE_COLUMNS },
];

function excelSerialDate(serial: number): string {
  const utc = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000);
  const month = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utc.getUTCDate()).padStart(2, "0");
  return `${utc.getUTCFullYear()}-${month}-${day}`;
}

function displayCell(column: MarathonCsvColumn, value: ExcelJS.CellValue): string {
  if (typeof value === "number" && column === "start_date" && value > 20_000 && value < 80_000) {
    return excelSerialDate(value);
  }
  if (
    typeof value === "number"
    && (column === "unlock_hour" || column === "reminder_hour")
    && value >= 0
    && value < 1
  ) {
    const total = Math.round(value * 24 * 60);
    const hours = Math.floor(total / 60) % 24;
    const minutes = total % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }
  return cellText(value).trim();
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) {
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${value.getUTCFullYear()}-${month}-${day}`;
  }
  if (typeof value === "object" && "text" in value && typeof value.text === "string") return value.text;
  if (typeof value === "object" && "result" in value) return cellText(value.result as ExcelJS.CellValue);
  if (typeof value === "object" && "richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text).join("");
  }
  return "";
}

function headerIndex(sheet: ExcelJS.Worksheet, columns: Array<[string, MarathonCsvColumn]>): Map<MarathonCsvColumn, number> | string {
  const header = sheet.getRow(1);
  const found = new Map<string, number>();
  header.eachCell((cell, index) => {
    const name = cellText(cell.value).trim().toLowerCase();
    if (name) found.set(name, index);
  });
  const map = new Map<MarathonCsvColumn, number>();
  const missing: string[] = [];
  for (const [label, column] of columns) {
    const index = found.get(label);
    if (!index) missing.push(label);
    else map.set(column, index);
  }
  if (missing.length > 0) return `Аркуш «${sheet.name}»: немає колонок ${missing.join(", ")}.`;
  return map;
}

export async function parseMarathonWorkbook(bytes: Uint8Array): Promise<CsvParseResult> {
  if (bytes.byteLength > MAX_BYTES) {
    return { ok: false, errors: [{ row: 0, message: "Файл завеликий. Межа — 2 МБ." }] };
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer);
  } catch {
    return { ok: false, errors: [{ row: 0, message: "Файл не читається як таблиця Excel." }] };
  }
  const where = new Map<number, string>();
  const records: Array<{ row: number; cells: Partial<Record<MarathonCsvColumn, string>> }> = [];
  let slug = "";
  let recordRow = 0;
  let sawSample = false;
  for (const spec of SHEETS) {
    const sheet = workbook.getWorksheet(spec.name);
    if (!sheet) {
      return { ok: false, errors: [{ row: 0, message: `Немає аркуша «${spec.name}».` }] };
    }
    const indexed = headerIndex(sheet, spec.columns);
    if (typeof indexed === "string") return { ok: false, errors: [{ row: 1, message: indexed }] };
    let count = 0;
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const cells: Partial<Record<MarathonCsvColumn, string>> = { row_type: spec.kind };
      let any = false;
      for (const [, column] of spec.columns) {
        const index = indexed.get(column);
        const value = index ? displayCell(column, row.getCell(index).value) : "";
        if (value) any = true;
        cells[column] = value;
      }
      if (!any) continue;
      if (spec.kind === "marathon" && (cells.slug ?? "").toLowerCase() === CSV_SAMPLE_SLUG) {
        sawSample = true;
        continue;
      }
      if (spec.kind !== "marathon" && slug.toLowerCase() === CSV_SAMPLE_SLUG) {
        sawSample = true;
        continue;
      }
      if (spec.kind !== "marathon" && slug === "") continue;
      count += 1;
      if (count > MAX_ROWS) {
        return { ok: false, errors: [{ row: 0, message: `Аркуш «${spec.name}» має більше ${MAX_ROWS} рядків.` }] };
      }
      if (spec.kind === "marathon") slug = cells.slug ?? "";
      else cells.slug = slug;
      if (spec.kind === "riddle") cells.riddle_scope = "marathon";
      recordRow += 1;
      where.set(recordRow, `Аркуш «${spec.name}», рядок ${rowNumber}`);
      records.push({ row: recordRow, cells });
    }
  }
  if (!records.some((record) => record.cells.row_type === "marathon") && sawSample) {
    return {
      ok: false,
      errors: [{
        row: 2,
        message: "Це зразок із шаблону. Замініть адресу pryklad і рядки зразка своїми даними.",
      }],
    };
  }
  const parsed = parseMarathonRecords(records);
  if (parsed.ok) return parsed;
  return {
    ok: false,
    errors: parsed.errors.map((issue) => ({
      row: issue.row,
      message: where.get(issue.row) ? `${where.get(issue.row)}: ${issue.message}` : issue.message,
    })),
  };
}

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: Array<[string, MarathonCsvColumn]>,
  rows: Array<Partial<Record<MarathonCsvColumn, string>>>,
) {
  const sheet = workbook.addWorksheet(name);
  const header = sheet.addRow(columns.map(([label]) => label));
  header.font = { bold: true };
  columns.forEach(([, column], index) => {
    const note = COLUMN_NOTES[column];
    if (note) header.getCell(index + 1).note = note;
    sheet.getColumn(index + 1).width = 22;
  });
  for (const row of rows) sheet.addRow(columns.map(([, column]) => row[column] ?? ""));
}

function addInstructionSheet(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet(SHEET_GUIDE);
  sheet.getColumn(1).width = 96;
  const title = sheet.addRow(["Інструкція"]);
  title.font = { bold: true };
  for (const step of MARATHON_IMPORT_STEPS) sheet.addRow([step]);
  sheet.addRow([]);
  sheet.addRow(["Аркуш «Приклад» і рядки з адресою pryklad імпорт пропускає."]);
}

function addExampleSheet(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet(SHEET_EXAMPLE);
  sheet.getColumn(1).width = 28;
  const title = sheet.addRow(["Цей аркуш не імпортується. Нижче зразок заповнення."]);
  title.font = { bold: true };
  sheet.addRow([]);
  const blocks: Array<[string, Array<[string, MarathonCsvColumn]>, Array<Partial<Record<MarathonCsvColumn, string>>>]> = [
    [SHEET_MARATHON, MARATHON_COLUMNS, [{
      slug: CSV_SAMPLE_SLUG,
      title: "Приклад марафону",
      subject: "math",
      description: "Короткий опис для картки",
      status: "draft",
      start_date: "2026-11-20",
      unlock_hour: "09:00",
      reminder_hour: "19:00",
      nudge_from: "10",
      nudge_until: "21",
      days_count: "5",
      pass_threshold: "60",
      final_cta_text: "Продовжити навчання",
      final_cta_url: "https://nmt.in.ua",
      invite_audience: "none",
      landing_riddle_count: "3",
    }]],
    [SHEET_DAYS, DAY_COLUMNS, [{ day_number: "1", topic: "Дроби", intro_text: "Короткий вступ дня" }]],
    [SHEET_MATERIALS, MATERIAL_COLUMNS, [{
      day_number: "1",
      material_order: "1",
      material_type: "text",
      material_body: "Прочитай правило.",
    }]],
    [SHEET_TASKS, TASK_COLUMNS, [{ day_number: "1", task_order: "1", question_id: "123456" }]],
    [SHEET_RIDDLES, RIDDLE_COLUMNS, [{
      riddle_subject: "math",
      riddle_title: "Скільки буде 2+2?",
      riddle_body: "Обери відповідь.",
      riddle_hint: "Порахуй ще раз.",
      riddle_options: "3 | 4 | 5",
      riddle_correct: "2",
    }]],
  ];
  for (const [name, columns, rows] of blocks) {
    const heading = sheet.addRow([name]);
    heading.font = { bold: true };
    sheet.addRow(columns.map(([label]) => label));
    for (const row of rows) sheet.addRow(columns.map(([, column]) => row[column] ?? ""));
    sheet.addRow([]);
  }
}

async function workbookBytes(workbook: ExcelJS.Workbook): Promise<Uint8Array> {
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

export async function documentToWorkbook(document: MarathonCsvDocument): Promise<Uint8Array> {
  const meta = document.marathon;
  const workbook = new ExcelJS.Workbook();
  addInstructionSheet(workbook);
  addSheet(workbook, SHEET_MARATHON, MARATHON_COLUMNS, [{
    slug: meta.slug,
    title: meta.title,
    subject: meta.subject,
    description: meta.description,
    status: meta.status,
    start_date: meta.startDate,
    unlock_hour: meta.unlockHour,
    reminder_hour: meta.reminderHour,
    nudge_from: String(meta.nudgeFrom),
    nudge_until: String(meta.nudgeUntil),
    days_count: String(meta.daysCount),
    pass_threshold: String(meta.passThreshold),
    final_cta_text: meta.finalCtaText,
    final_cta_url: meta.finalCtaUrl,
    intro_video_url: meta.introVideoUrl,
    invite_audience: meta.inviteAudience,
    landing_riddle_count: String(meta.landingRiddleCount),
    public_chat_url: meta.publicChatUrl,
  }]);
  addSheet(workbook, SHEET_DAYS, DAY_COLUMNS, document.days.map((day) => ({
    day_number: String(day.dayNumber),
    topic: day.topic,
    intro_text: day.introText,
  })));
  addSheet(workbook, SHEET_MATERIALS, MATERIAL_COLUMNS, document.days.flatMap((day) => day.materials.map((material) => ({
    day_number: String(day.dayNumber),
    material_order: String(material.order),
    material_type: material.type,
    material_body: material.body,
  }))));
  addSheet(workbook, SHEET_TASKS, TASK_COLUMNS, document.days.flatMap((day) => day.tasks.map((task) => ({
    day_number: String(day.dayNumber),
    task_order: String(task.order),
    question_id: task.questionId == null ? "" : String(task.questionId),
    inline_prompt: task.prompt ?? "",
    inline_options: task.options?.join(" | ") ?? "",
    inline_correct: task.correct == null ? "" : String(task.correct),
    inline_explanation: task.explanation ?? "",
  }))));
  addSheet(workbook, SHEET_RIDDLES, RIDDLE_COLUMNS, document.riddles.map((riddle) => ({
    riddle_subject: riddle.subject ?? "",
    riddle_title: riddle.title,
    riddle_body: riddle.body,
    riddle_hint: riddle.hint ?? "",
    riddle_options: riddle.options.join(" | "),
    riddle_correct: String(riddle.correct),
  })));
  addExampleSheet(workbook);
  return workbookBytes(workbook);
}

export async function marathonWorkbookTemplate(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  addInstructionSheet(workbook);
  addSheet(workbook, SHEET_MARATHON, MARATHON_COLUMNS, [{
    slug: CSV_SAMPLE_SLUG,
    title: "Приклад марафону",
    subject: "math",
    description: "Короткий опис для картки",
    status: "draft",
    start_date: "2026-11-20",
    unlock_hour: "09:00",
    reminder_hour: "19:00",
    nudge_from: "10",
    nudge_until: "21",
    days_count: "5",
    pass_threshold: "60",
    final_cta_text: "Продовжити навчання",
    final_cta_url: "https://nmt.in.ua",
    invite_audience: "none",
    landing_riddle_count: "3",
  }]);
  addSheet(workbook, SHEET_DAYS, DAY_COLUMNS, [{
    day_number: "1",
    topic: "Дроби",
    intro_text: "Короткий вступ дня",
  }]);
  addSheet(workbook, SHEET_MATERIALS, MATERIAL_COLUMNS, [{
    day_number: "1",
    material_order: "1",
    material_type: "text",
    material_body: "Прочитай правило.",
  }]);
  addSheet(workbook, SHEET_TASKS, TASK_COLUMNS, [{
    day_number: "1",
    task_order: "1",
    question_id: "123456",
  }]);
  addSheet(workbook, SHEET_RIDDLES, RIDDLE_COLUMNS, [{
    riddle_subject: "math",
    riddle_title: "Скільки буде 2+2?",
    riddle_body: "Обери відповідь.",
    riddle_hint: "Порахуй ще раз.",
    riddle_options: "3 | 4 | 5",
    riddle_correct: "2",
  }]);
  addExampleSheet(workbook);
  return workbookBytes(workbook);
}
