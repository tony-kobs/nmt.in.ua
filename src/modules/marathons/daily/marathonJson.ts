import {
  CSV_SAMPLE_SLUG,
  parseMarathonRecords,
  type CsvParseResult,
  type MarathonCsvColumn,
  type MarathonCsvDocument,
} from "./marathonCsv";

export const MARATHON_JSON_FORMAT = "nmt-marathon";
export const MARATHON_JSON_VERSION = 1;
const MAX_TEXT = 500_000;

function cellText(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value : "";
}

function list(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => cellText(item).trim()).filter(Boolean).join(" | ");
  return cellText(value);
}

/** Nested file. `format` and `version` let a later reader reject unknown shapes. */
export function documentToJson(document: MarathonCsvDocument): string {
  const meta = document.marathon;
  return `${JSON.stringify({
    format: MARATHON_JSON_FORMAT,
    version: MARATHON_JSON_VERSION,
    marathon: {
      slug: meta.slug,
      title: meta.title,
      subject: meta.subject,
      description: meta.description,
      status: meta.status,
      startDate: meta.startDate,
      unlockHour: meta.unlockHour,
      reminderHour: meta.reminderHour,
      nudgeFrom: meta.nudgeFrom,
      nudgeUntil: meta.nudgeUntil,
      daysCount: meta.daysCount,
      passThreshold: meta.passThreshold,
      finalCtaText: meta.finalCtaText,
      finalCtaUrl: meta.finalCtaUrl,
      introVideoUrl: meta.introVideoUrl,
      inviteAudience: meta.inviteAudience,
      landingRiddleCount: meta.landingRiddleCount,
      publicChatUrl: meta.publicChatUrl,
    },
    days: document.days.map((day) => ({
      dayNumber: day.dayNumber,
      topic: day.topic,
      introText: day.introText,
      materials: day.materials.map((material) => ({
        order: material.order,
        type: material.type,
        body: material.body,
      })),
      tasks: [...day.tasks].sort((left, right) => left.order - right.order).map((task) => (
        task.questionId != null
          ? { order: task.order, questionId: task.questionId }
          : {
              order: task.order,
              prompt: task.prompt ?? "",
              options: task.options ?? [],
              correct: task.correct,
              explanation: task.explanation ?? "",
            }
      )),
    })),
    riddles: document.riddles.map((riddle) => ({
      subject: riddle.subject ?? "",
      title: riddle.title,
      body: riddle.body,
      hint: riddle.hint ?? "",
      options: riddle.options,
      correct: riddle.correct,
    })),
  }, null, 2)}\n`;
}

export function marathonJsonTemplate(): string {
  return `${JSON.stringify({
    format: MARATHON_JSON_FORMAT,
    version: MARATHON_JSON_VERSION,
    marathon: {
      slug: CSV_SAMPLE_SLUG,
      title: "Приклад марафону",
      subject: "math",
      description: "Короткий опис для картки",
      status: "draft",
      startDate: "2026-11-20",
      unlockHour: "09:00",
      reminderHour: "19:00",
      nudgeFrom: 10,
      nudgeUntil: 21,
      daysCount: 5,
      passThreshold: 60,
      finalCtaText: "Продовжити навчання",
      finalCtaUrl: "https://nmt.in.ua",
      introVideoUrl: "",
      inviteAudience: "none",
      landingRiddleCount: 3,
      publicChatUrl: "",
    },
    days: [{
      dayNumber: 1,
      topic: "Дроби",
      introText: "Короткий вступ дня",
      materials: [{ order: 1, type: "text", body: "Прочитай правило." }],
      tasks: [{ order: 1, questionId: 123456 }],
    }],
    riddles: [{
      subject: "math",
      title: "Скільки буде 2+2?",
      body: "Обери відповідь.",
      hint: "Порахуй ще раз.",
      options: ["3", "4", "5"],
      correct: 2,
    }],
  }, null, 2)}\n`;
}

export function parseMarathonJson(text: string): CsvParseResult {
  if (text.length > MAX_TEXT) {
    return { ok: false, errors: [{ row: 0, message: "Файл завеликий. Межа — 500 КБ тексту." }] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, errors: [{ row: 0, message: "Це не JSON." }] };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, errors: [{ row: 0, message: "JSON має бути об’єктом." }] };
  }
  const root = parsed as Record<string, unknown>;
  if (root.format !== MARATHON_JSON_FORMAT) {
    return { ok: false, errors: [{ row: 0, message: "У файлі має бути format: nmt-marathon." }] };
  }
  if (root.version !== MARATHON_JSON_VERSION) {
    return {
      ok: false,
      errors: [{ row: 0, message: `Підтримується лише version ${MARATHON_JSON_VERSION}.` }],
    };
  }
  const marathon = root.marathon;
  if (!marathon || typeof marathon !== "object" || Array.isArray(marathon)) {
    return { ok: false, errors: [{ row: 1, message: "Немає об’єкта marathon." }] };
  }
  const meta = marathon as Record<string, unknown>;
  const slug = cellText(meta.slug);
  let row = 1;
  const records: Array<{ row: number; cells: Partial<Record<MarathonCsvColumn, string>> }> = [{
    row,
    cells: {
      row_type: "marathon",
      slug,
      title: cellText(meta.title),
      subject: cellText(meta.subject),
      description: cellText(meta.description),
      status: cellText(meta.status),
      start_date: cellText(meta.startDate),
      unlock_hour: cellText(meta.unlockHour),
      reminder_hour: cellText(meta.reminderHour),
      nudge_from: cellText(meta.nudgeFrom),
      nudge_until: cellText(meta.nudgeUntil),
      days_count: cellText(meta.daysCount),
      pass_threshold: cellText(meta.passThreshold),
      final_cta_text: cellText(meta.finalCtaText),
      final_cta_url: cellText(meta.finalCtaUrl),
      intro_video_url: cellText(meta.introVideoUrl),
      invite_audience: cellText(meta.inviteAudience),
      landing_riddle_count: cellText(meta.landingRiddleCount),
      public_chat_url: cellText(meta.publicChatUrl),
    },
  }];
  const days = Array.isArray(root.days) ? root.days : null;
  if (!days) return { ok: false, errors: [{ row: 0, message: "days має бути списком." }] };
  for (const day of days) {
    if (!day || typeof day !== "object" || Array.isArray(day)) {
      return { ok: false, errors: [{ row: 0, message: "Кожен день має бути об’єктом." }] };
    }
    const item = day as Record<string, unknown>;
    row += 1;
    const dayRow = row;
    records.push({
      row: dayRow,
      cells: {
        row_type: "day",
        slug,
        day_number: cellText(item.dayNumber),
        topic: cellText(item.topic),
        intro_text: cellText(item.introText),
      },
    });
    const materials = Array.isArray(item.materials) ? item.materials : [];
    const tasks = Array.isArray(item.tasks) ? item.tasks : [];
    for (const material of materials) {
      row += 1;
      const cell = material && typeof material === "object" ? material as Record<string, unknown> : {};
      records.push({
        row,
        cells: {
          row_type: "material",
          slug,
          day_number: cellText(item.dayNumber),
          material_order: cellText(cell.order),
          material_type: cellText(cell.type),
          material_body: cellText(cell.body),
        },
      });
    }
    for (const task of tasks) {
      row += 1;
      const cell = task && typeof task === "object" ? task as Record<string, unknown> : {};
      records.push({
        row,
        cells: {
          row_type: "task",
          slug,
          day_number: cellText(item.dayNumber),
          task_order: cellText(cell.order),
          question_id: cellText(cell.questionId),
          inline_prompt: cellText(cell.prompt),
          inline_options: list(cell.options),
          inline_correct: cellText(cell.correct),
          inline_explanation: cellText(cell.explanation),
        },
      });
    }
  }
  const riddles = Array.isArray(root.riddles) ? root.riddles : [];
  for (const riddle of riddles) {
    row += 1;
    const cell = riddle && typeof riddle === "object" ? riddle as Record<string, unknown> : {};
    records.push({
      row,
      cells: {
        row_type: "riddle",
        slug,
        riddle_scope: "marathon",
        riddle_subject: cellText(cell.subject),
        riddle_title: cellText(cell.title),
        riddle_body: cellText(cell.body),
        riddle_hint: cellText(cell.hint),
        riddle_options: list(cell.options),
        riddle_correct: cellText(cell.correct),
      },
    });
  }
  return parseMarathonRecords(records);
}
