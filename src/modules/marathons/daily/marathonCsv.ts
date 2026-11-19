import { parseUnlockHour } from "./calendar";
import { isDailyStatus, isSlug } from "./forms";
import { isInviteAudience, type InviteAudience } from "./invite";
import { loomEmbedSrc, youtubeEmbedSrc } from "./richText";
import { normalizeCtaUrl, toCsv } from "./utm";

/** Sample rows use this slug so uploading the template unchanged does nothing. */
export const CSV_SAMPLE_SLUG = "pryklad";

export const MARATHON_CSV_COLUMNS = [
  "row_type",
  "slug",
  "title",
  "subject",
  "description",
  "status",
  "start_date",
  "unlock_hour",
  "reminder_hour",
  "nudge_from",
  "nudge_until",
  "days_count",
  "pass_threshold",
  "final_cta_text",
  "final_cta_url",
  "intro_video_url",
  "invite_audience",
  "landing_riddle_count",
  "public_chat_url",
  "day_number",
  "topic",
  "intro_text",
  "material_order",
  "material_type",
  "material_body",
  "task_order",
  "question_id",
  "inline_prompt",
  "inline_options",
  "inline_correct",
  "inline_explanation",
  "riddle_scope",
  "riddle_subject",
  "riddle_title",
  "riddle_body",
  "riddle_hint",
  "riddle_options",
  "riddle_correct",
] as const;

export type MarathonCsvColumn = (typeof MARATHON_CSV_COLUMNS)[number];

const MAX_TEXT = 500_000;
const MAX_ROWS = 500;

export type CsvIssue = { row: number; message: string };

export type MarathonCsvTask = {
  row: number;
  order: number;
  questionId: number | null;
  prompt: string | null;
  options: string[] | null;
  correct: number | null;
  explanation: string | null;
};

export type MarathonCsvMaterial = {
  row: number;
  order: number;
  type: "text" | "youtube" | "loom";
  body: string;
};

export type MarathonCsvDay = {
  row: number;
  dayNumber: number;
  topic: string;
  introText: string;
  materials: MarathonCsvMaterial[];
  tasks: MarathonCsvTask[];
};

export type MarathonCsvRiddle = {
  row: number;
  subject: string | null;
  title: string;
  body: string;
  hint: string | null;
  options: string[];
  correct: number;
};

export type MarathonCsvMeta = {
  row: number;
  slug: string;
  title: string;
  subject: string;
  description: string;
  status: "draft" | "active" | "finished" | "archived";
  startDate: string;
  unlockHour: string;
  reminderHour: string;
  nudgeFrom: number;
  nudgeUntil: number;
  daysCount: number;
  passThreshold: number;
  finalCtaText: string;
  finalCtaUrl: string;
  introVideoUrl: string;
  inviteAudience: InviteAudience;
  landingRiddleCount: number;
  publicChatUrl: string;
};

export type MarathonCsvDocument = {
  marathon: MarathonCsvMeta;
  days: MarathonCsvDay[];
  riddles: MarathonCsvRiddle[];
};

export type CsvParseResult =
  | { ok: true; document: MarathonCsvDocument }
  | { ok: false; errors: CsvIssue[] };

type RawRow = { row: number; cells: Record<MarathonCsvColumn, string> };

function issue(errors: CsvIssue[], row: number, message: string) {
  if (errors.length >= 40) return;
  errors.push({ row, message });
}

function unescapeFormula(value: string): string {
  const text = value.trim();
  if (text.length >= 2 && text.startsWith("'") && /^[=+\-@]/.test(text[1] ?? "")) {
    return text.slice(1);
  }
  return text;
}

/** RFC 4180-ish. The only delimiter is `;`. A comma inside a cell (0,5) is data. */
export function parseCsvRecords(text: string): { ok: true; rows: string[][] } | { ok: false; error: string } {
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!source.trim()) return { ok: false, error: "Файл порожній." };
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? "";
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      if (cell.length > 0) return { ok: false, error: "Лапки стоять усередині значення без обрамлення." };
      quoted = true;
      continue;
    }
    if (char === ";") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  if (quoted) return { ok: false, error: "У файлі не закриті лапки." };
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  while (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (last && last.every((item) => item.trim() === "")) rows.pop();
    else break;
  }
  return { ok: true, rows };
}

function readRows(text: string): { ok: true; rows: RawRow[] } | { ok: false; errors: CsvIssue[] } {
  if (text.length > MAX_TEXT) {
    return { ok: false, errors: [{ row: 0, message: "Файл завеликий. Межа — 500 КБ тексту." }] };
  }
  const parsed = parseCsvRecords(text);
  if (!parsed.ok) return { ok: false, errors: [{ row: 0, message: parsed.error }] };
  if ((parsed.rows[0]?.length ?? 0) <= 1) {
    return { ok: false, errors: [{ row: 1, message: "Роздільник має бути ;" }] };
  }
  if (parsed.rows.length < 2) {
    return { ok: false, errors: [{ row: 1, message: "Потрібен рядок заголовка і хоча б один рядок даних." }] };
  }
  if (parsed.rows.length > MAX_ROWS + 1) {
    return { ok: false, errors: [{ row: 0, message: `Забагато рядків. Межа — ${MAX_ROWS}.` }] };
  }
  const header = parsed.rows[0]?.map((cell) => cell.trim()) ?? [];
  if (
    header.length !== MARATHON_CSV_COLUMNS.length ||
    MARATHON_CSV_COLUMNS.some((column, index) => header[index] !== column)
  ) {
    return {
      ok: false,
      errors: [{
        row: 1,
        message: "Заголовок не збігається з шаблоном. Завантажте шаблон і не змінюйте перший рядок.",
      }],
    };
  }
  const rows: RawRow[] = [];
  for (let index = 1; index < parsed.rows.length; index += 1) {
    const record = parsed.rows[index] ?? [];
    const rowNumber = index + 1;
    if (record.length !== MARATHON_CSV_COLUMNS.length) {
      return {
        ok: false,
        errors: [{
          row: rowNumber,
          message: `У рядку ${record.length} колонок, а в заголовку ${MARATHON_CSV_COLUMNS.length}.`,
        }],
      };
    }
    const cells = {} as Record<MarathonCsvColumn, string>;
    MARATHON_CSV_COLUMNS.forEach((column, columnIndex) => {
      cells[column] = unescapeFormula(record[columnIndex] ?? "");
    });
    rows.push({ row: rowNumber, cells });
  }
  return { ok: true, rows };
}

function splitList(value: string): string[] {
  if (!value.trim()) return [];
  return value.split("|").map((item) => item.trim()).filter((item) => item.length > 0);
}

function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function readIntIn(value: string, min: number, max: number): number | null {
  if (!/^-?\d+$/.test(value)) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) return null;
  return number;
}

function blank(cells: RawRow["cells"], names: readonly MarathonCsvColumn[]): boolean {
  return names.every((name) => cells[name] === "");
}

const MATERIAL_FIELDS = ["material_order", "material_type", "material_body"] as const;
const TASK_FIELDS = [
  "task_order",
  "question_id",
  "inline_prompt",
  "inline_options",
  "inline_correct",
  "inline_explanation",
] as const;
const RIDDLE_FIELDS = [
  "riddle_scope",
  "riddle_subject",
  "riddle_title",
  "riddle_body",
  "riddle_hint",
  "riddle_options",
  "riddle_correct",
] as const;

function fullCells(
  cells: Partial<Record<MarathonCsvColumn, string>>,
): Record<MarathonCsvColumn, string> {
  const filled = {} as Record<MarathonCsvColumn, string>;
  for (const column of MARATHON_CSV_COLUMNS) filled[column] = (cells[column] ?? "").trim();
  return filled;
}

/** Same checks as CSV, for rows already split by JSON or a spreadsheet. */
export function parseMarathonRecords(
  records: Array<{ row: number; cells: Partial<Record<MarathonCsvColumn, string>> }>,
): CsvParseResult {
  return parseRawRows(records.map((record) => ({ row: record.row, cells: fullCells(record.cells) })));
}

export function parseMarathonCsv(text: string): CsvParseResult {
  const read = readRows(text);
  if (!read.ok) return read;
  return parseRawRows(read.rows);
}

function parseRawRows(rows: RawRow[]): CsvParseResult {
  const errors: CsvIssue[] = [];
  const marathonRows = rows.filter((row) => row.cells.row_type === "marathon");
  if (marathonRows.length !== 1) {
    issue(
      errors,
      marathonRows[0]?.row ?? 2,
      marathonRows.length === 0
        ? "Потрібен один рядок row_type=marathon."
        : "Рядок marathon має бути один.",
    );
  }
  const source = marathonRows[0];
  if (!source || errors.length > 0) return { ok: false, errors };

  const cells = source.cells;
  const slug = cells.slug.toLowerCase();
  if (slug === CSV_SAMPLE_SLUG) {
    return {
      ok: false,
      errors: [{
        row: source.row,
        message: "Це зразок із шаблону. Замініть адресу pryklad і рядки зразка своїми даними.",
      }],
    };
  }
  if (!isSlug(slug)) issue(errors, source.row, "Адреса (slug) має бути латиницею, цифрами і дефісами.");
  if (cells.title.trim().length < 2) issue(errors, source.row, "Назва марафону закоротка.");
  const subject = cells.subject.trim() || "math";
  if (subject.length > 64) issue(errors, source.row, "Предмет довший за 64 символи.");
  const description = cells.description.trim();
  if (description.length > 2000) issue(errors, source.row, "Опис довший за 2000 символів.");
  if (!isDailyStatus(cells.status)) {
    issue(errors, source.row, "Статус має бути draft, active, finished або archived.");
  }
  if (!isIsoDate(cells.start_date)) {
    issue(errors, source.row, "Дата старту має бути у вигляді РРРР-ММ-ДД.");
  }
  const unlockHour = cells.unlock_hour.trim();
  if (!parseUnlockHour(unlockHour)) issue(errors, source.row, "Година відкриття має бути ГГ:ХХ, наприклад 09:00.");
  const reminderHour = (cells.reminder_hour || "19:00").trim();
  if (!parseUnlockHour(reminderHour)) issue(errors, source.row, "Година нагадування має бути ГГ:ХХ.");
  const nudgeFrom = readIntIn(cells.nudge_from || "10", 0, 23);
  const nudgeUntil = readIntIn(cells.nudge_until || "21", 0, 23);
  if (nudgeFrom == null) issue(errors, source.row, "Пропуск «від» — година від 0 до 23.");
  if (nudgeUntil == null) issue(errors, source.row, "Пропуск «до» — година від 0 до 23.");
  if (nudgeFrom != null && nudgeUntil != null && nudgeFrom >= nudgeUntil) {
    issue(errors, source.row, "Година «пропуск до» має бути пізніше за «пропуск від».");
  }
  const daysCount = readIntIn(cells.days_count, 1, 14);
  if (daysCount == null) issue(errors, source.row, "Кількість днів — ціле від 1 до 14.");
  const passThreshold = readIntIn(cells.pass_threshold, 0, 100);
  if (passThreshold == null) issue(errors, source.row, "Поріг — ціле від 0 до 100.");
  const finalCtaText = cells.final_cta_text.trim();
  if (!finalCtaText || finalCtaText.length > 500) {
    issue(errors, source.row, "Потрібен текст фінальної кнопки, до 500 символів.");
  }
  const finalCtaUrl = normalizeCtaUrl(cells.final_cta_url);
  if (!finalCtaUrl) issue(errors, source.row, "Посилання фінальної кнопки має бути https або шляхом від /.");
  const introVideo = cells.intro_video_url.trim();
  if (introVideo && !youtubeEmbedSrc(introVideo) && !loomEmbedSrc(introVideo)) {
    issue(errors, source.row, "Відео вступу має бути посиланням YouTube або Loom.");
  }
  const audienceRaw = cells.invite_audience.trim() || "none";
  if (!isInviteAudience(audienceRaw)) {
    issue(errors, source.row, "Кого сповістити: none, students або all.");
  }
  const landingRiddleCount = readIntIn(cells.landing_riddle_count || "3", 1, 12);
  if (landingRiddleCount == null) issue(errors, source.row, "Кількість загадок на сторінці — від 1 до 12.");
  const publicChatRaw = cells.public_chat_url.trim();
  const publicChatUrl = publicChatRaw ? normalizeCtaUrl(publicChatRaw) : "";
  if (publicChatRaw && !publicChatUrl) issue(errors, source.row, "Посилання чату має бути https або шляхом від /.");

  const days = new Map<number, MarathonCsvDay>();
  const riddles: MarathonCsvRiddle[] = [];

  for (const record of rows) {
    if (record === source) continue;
    const kind = record.cells.row_type;
    if (record.cells.slug.toLowerCase() !== slug) {
      issue(errors, record.row, "Адреса в рядку не збігається з рядком marathon.");
    }
    if (kind === "day") {
      if (!blank(record.cells, [...MATERIAL_FIELDS, ...TASK_FIELDS, ...RIDDLE_FIELDS])) {
        issue(errors, record.row, "Рядок day містить колонки матеріалу, завдання або загадки. Розділіть їх на окремі рядки.");
      }
      const dayNumber = readIntIn(record.cells.day_number, 1, 14);
      if (dayNumber == null) issue(errors, record.row, "Номер дня — ціле від 1 до 14.");
      else if (daysCount != null && dayNumber > daysCount) {
        issue(errors, record.row, "Номер дня більший за кількість днів марафону.");
      }
      const topic = record.cells.topic.trim();
      if (topic.length < 2 || topic.length > 255) issue(errors, record.row, "Тема дня — від 2 до 255 символів.");
      const introText = record.cells.intro_text.trim();
      if (introText.length > 20000) issue(errors, record.row, "Вступ дня довший за 20000 символів.");
      if (dayNumber != null && days.has(dayNumber)) issue(errors, record.row, "День з таким номером уже є у файлі.");
      if (dayNumber != null && !days.has(dayNumber)) {
        days.set(dayNumber, { row: record.row, dayNumber, topic, introText, materials: [], tasks: [] });
      }
      continue;
    }
    if (kind === "material" || kind === "task") {
      const dayNumber = readIntIn(record.cells.day_number, 1, 14);
      const day = dayNumber == null ? undefined : days.get(dayNumber);
      if (dayNumber == null) issue(errors, record.row, "Вкажіть номер дня.");
      else if (!day) issue(errors, record.row, "Спочатку має бути рядок day з цим номером.");
      if (kind === "material") {
        const order = readIntIn(record.cells.material_order, 1, 50);
        const type = record.cells.material_type;
        const body = record.cells.material_body.trim();
        if (order == null) issue(errors, record.row, "Порядок матеріалу — ціле від 1 до 50.");
        if (type !== "text" && type !== "youtube" && type !== "loom") {
          issue(errors, record.row, "Тип матеріалу: text, youtube або loom.");
        }
        if (!body || body.length > 20000) issue(errors, record.row, "Потрібен текст або посилання матеріалу.");
        if (type === "youtube" && !youtubeEmbedSrc(body)) issue(errors, record.row, "Посилання YouTube не читається.");
        if (type === "loom" && !loomEmbedSrc(body)) issue(errors, record.row, "Посилання Loom не читається.");
        if (day && order != null && day.materials.some((item) => item.order === order)) {
          issue(errors, record.row, "Такий порядок матеріалу в цьому дні вже є.");
        }
        if (day && order != null && (type === "text" || type === "youtube" || type === "loom") && body) {
          day.materials.push({ row: record.row, order, type, body });
        }
      } else {
        const order = readIntIn(record.cells.task_order, 1, 50);
        const questionRaw = record.cells.question_id.trim();
        const prompt = record.cells.inline_prompt.trim();
        const options = splitList(record.cells.inline_options);
        const correctRaw = record.cells.inline_correct.trim();
        const explanation = record.cells.inline_explanation.trim();
        if (order == null) issue(errors, record.row, "Порядок завдання — ціле від 1 до 50.");
        const hasBank = questionRaw.length > 0;
        const hasInline = prompt.length > 0 || options.length > 0 || correctRaw.length > 0;
        if (hasBank && hasInline) {
          issue(errors, record.row, "Вкажіть або question_id з банку, або своє формулювання, не обидва.");
        } else if (!hasBank && !hasInline) {
          issue(errors, record.row, "Завдання порожнє: потрібен question_id або своє формулювання.");
        }
        let questionId: number | null = null;
        let inline: Pick<MarathonCsvTask, "prompt" | "options" | "correct" | "explanation"> | null = null;
        if (hasBank && !hasInline) {
          questionId = readIntIn(questionRaw, 1, 2_000_000_000);
          if (questionId == null) issue(errors, record.row, "question_id має бути додатним цілим.");
          if (explanation || prompt || options.length || correctRaw) {
            issue(errors, record.row, "Для завдання з банку залиште колонки формулювання порожніми.");
          }
        }
        if (!hasBank && hasInline) {
          if (prompt.length < 2) issue(errors, record.row, "Своє формулювання закоротке.");
          if (options.length < 2 || options.length > 4) {
            issue(errors, record.row, "Свої варіанти — від 2 до 4, через символ |.");
          }
          if (new Set(options).size !== options.length) issue(errors, record.row, "Варіанти відповіді не мають повторюватися.");
          const correct = readIntIn(correctRaw, 1, options.length || 1);
          if (correct == null) issue(errors, record.row, "Номер правильної відповіді не входить у список варіантів.");
          if (explanation.length > 4000) issue(errors, record.row, "Пояснення довше за 4000 символів.");
          inline = {
            prompt,
            options,
            correct,
            explanation: explanation || null,
          };
        }
        if (day && order != null && day.tasks.some((item) => item.order === order)) {
          issue(errors, record.row, "Такий порядок завдання в цьому дні вже є.");
        }
        if (
          day &&
          questionId != null &&
          day.tasks.some((item) => item.questionId === questionId)
        ) {
          issue(errors, record.row, "Це завдання з банку вже стоїть у цьому дні.");
        }
        if (day && order != null && (questionId != null || inline?.correct != null)) {
          day.tasks.push({
            row: record.row,
            order,
            questionId,
            prompt: inline?.prompt ?? null,
            options: inline?.options ?? null,
            correct: inline?.correct ?? null,
            explanation: inline?.explanation ?? null,
          });
        }
      }
      continue;
    }
    if (kind === "riddle") {
      const scope = record.cells.riddle_scope.trim();
      if (scope !== "marathon") {
        issue(errors, record.row, "У файлі загадка має бути riddle_scope=marathon. Спільний банк редагується у формі загадок.");
      }
      const title = record.cells.riddle_title.trim();
      const body = record.cells.riddle_body.trim();
      const hint = record.cells.riddle_hint.trim();
      const options = splitList(record.cells.riddle_options);
      const subjectRiddle = record.cells.riddle_subject.trim();
      if (title.length < 2 || title.length > 255) issue(errors, record.row, "Назва загадки — від 2 до 255 символів.");
      if (!body || body.length > 8000) issue(errors, record.row, "Потрібен текст загадки.");
      if (hint.length > 2000) issue(errors, record.row, "Підказка загадки довша за 2000 символів.");
      if (options.length < 2 || options.length > 6) {
        issue(errors, record.row, "У загадки від 2 до 6 варіантів через символ |.");
      }
      if (new Set(options).size !== options.length) issue(errors, record.row, "Варіанти загадки не мають повторюватися.");
      const correct = readIntIn(record.cells.riddle_correct, 1, Math.max(options.length, 1));
      if (correct == null) issue(errors, record.row, "Номер правильної відповіді загадки не входить у список варіантів.");
      if (scope === "marathon" && title && body && correct != null && options.length >= 2) {
        riddles.push({
          row: record.row,
          subject: subjectRiddle || null,
          title,
          body,
          hint: hint || null,
          options,
          correct,
        });
      }
      continue;
    }
    issue(errors, record.row, "row_type має бути marathon, day, material, task або riddle.");
  }

  if (
    errors.length > 0 ||
    daysCount == null ||
    passThreshold == null ||
    nudgeFrom == null ||
    nudgeUntil == null ||
    landingRiddleCount == null ||
    !finalCtaUrl ||
    !parseUnlockHour(unlockHour) ||
    !parseUnlockHour(reminderHour) ||
    !isDailyStatus(cells.status) ||
    !isInviteAudience(audienceRaw)
  ) {
    return { ok: false, errors: errors.length > 0 ? errors : [{ row: source.row, message: "Рядок marathon не пройшов перевірку." }] };
  }

  const document: MarathonCsvDocument = {
    marathon: {
      row: source.row,
      slug,
      title: cells.title.trim(),
      subject,
      description,
      status: cells.status,
      startDate: cells.start_date,
      unlockHour,
      reminderHour,
      nudgeFrom,
      nudgeUntil,
      daysCount,
      passThreshold,
      finalCtaText,
      finalCtaUrl,
      introVideoUrl: introVideo,
      inviteAudience: audienceRaw,
      landingRiddleCount,
      publicChatUrl: publicChatUrl ?? "",
    },
    days: [...days.values()].sort((left, right) => left.dayNumber - right.dayNumber),
    riddles,
  };
  return { ok: true, document };
}

export function questionIdsOf(document: MarathonCsvDocument): number[] {
  const ids: number[] = [];
  for (const day of document.days) {
    for (const task of day.tasks) {
      if (task.questionId != null) ids.push(task.questionId);
    }
  }
  return ids;
}

/** Ids that are not in the published bank. Row numbers come from the file. */
export function missingQuestionIssues(
  document: MarathonCsvDocument,
  publishedIds: ReadonlySet<number>,
): CsvIssue[] {
  const issues: CsvIssue[] = [];
  for (const day of document.days) {
    for (const task of day.tasks) {
      if (task.questionId != null && !publishedIds.has(task.questionId)) {
        issue(
          issues,
          task.row,
          `Завдання ${task.questionId} немає в опублікованому банку.`,
        );
      }
    }
  }
  return issues;
}

export function importNotes(mode: "create" | "update", status: string): string[] {
  if (mode === "create") {
    const notes = [
      "Буде створено новий марафон як чернетку. Статус з файлу не вмикає розсилку.",
    ];
    if (status !== "draft") notes.push(`У файлі статус «${status}». Після імпорту курс лишається чернеткою, доки його не активувати в адмінці.`);
    return notes;
  }
  return [
    "Буде оновлено наявний марафон з цією адресою. Учасники лишаються.",
    "Статус курсу не змінюється.",
    "Дні, матеріали, завдання і загадки цього марафону замінюються вмістом файлу. Фото днів при цьому знімаються, фото вступу лишається.",
  ];
}

function columnRow(values: Partial<Record<MarathonCsvColumn, string>>): string[] {
  return MARATHON_CSV_COLUMNS.map((column) => values[column] ?? "");
}

export function documentToCsv(document: MarathonCsvDocument): string {
  const meta = document.marathon;
  const rows: string[][] = [
    [...MARATHON_CSV_COLUMNS],
    columnRow({
      row_type: "marathon",
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
    }),
  ];
  for (const day of document.days) {
    rows.push(columnRow({
      row_type: "day",
      slug: meta.slug,
      day_number: String(day.dayNumber),
      topic: day.topic,
      intro_text: day.introText,
    }));
    for (const material of day.materials) {
      rows.push(columnRow({
        row_type: "material",
        slug: meta.slug,
        day_number: String(day.dayNumber),
        material_order: String(material.order),
        material_type: material.type,
        material_body: material.body,
      }));
    }
    for (const task of [...day.tasks].sort((left, right) => left.order - right.order)) {
      rows.push(columnRow({
        row_type: "task",
        slug: meta.slug,
        day_number: String(day.dayNumber),
        task_order: String(task.order),
        question_id: task.questionId == null ? "" : String(task.questionId),
        inline_prompt: task.prompt ?? "",
        inline_options: task.options?.join(" | ") ?? "",
        inline_correct: task.correct == null ? "" : String(task.correct),
        inline_explanation: task.explanation ?? "",
      }));
    }
  }
  for (const riddle of document.riddles) {
    rows.push(columnRow({
      row_type: "riddle",
      slug: meta.slug,
      riddle_scope: "marathon",
      riddle_subject: riddle.subject ?? "",
      riddle_title: riddle.title,
      riddle_body: riddle.body,
      riddle_hint: riddle.hint ?? "",
      riddle_options: riddle.options.join(" | "),
      riddle_correct: String(riddle.correct),
    }));
  }
  return toCsv(rows, ";");
}

/** Header plus one example of each row type. The sample slug is rejected on import. */
export function marathonCsvTemplate(): string {
  return toCsv([
    [...MARATHON_CSV_COLUMNS],
    columnRow({
      row_type: "marathon",
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
      intro_video_url: "",
      invite_audience: "none",
      landing_riddle_count: "3",
      public_chat_url: "",
    }),
    columnRow({
      row_type: "day",
      slug: CSV_SAMPLE_SLUG,
      day_number: "1",
      topic: "Дроби",
      intro_text: "Короткий вступ дня",
    }),
    columnRow({
      row_type: "task",
      slug: CSV_SAMPLE_SLUG,
      day_number: "1",
      task_order: "1",
      question_id: "123456",
    }),
    columnRow({
      row_type: "riddle",
      slug: CSV_SAMPLE_SLUG,
      riddle_scope: "marathon",
      riddle_subject: "math",
      riddle_title: "Скільки буде 2+2?",
      riddle_body: "Обери відповідь.",
      riddle_hint: "Порахуй ще раз.",
      riddle_options: "3 | 4 | 5",
      riddle_correct: "2",
    }),
  ], ";");
}
