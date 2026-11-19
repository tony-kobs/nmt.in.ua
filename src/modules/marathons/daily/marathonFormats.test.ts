import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import {
  documentToJson,
  MARATHON_JSON_FORMAT,
  MARATHON_JSON_VERSION,
  marathonJsonTemplate,
  parseMarathonJson,
} from "./marathonJson";
import type { MarathonCsvDocument } from "./marathonCsv";
import {
  documentToWorkbook,
  marathonWorkbookTemplate,
  parseMarathonWorkbook,
  SHEET_MARATHON,
  SHEET_TASKS,
} from "./marathonWorkbook";

function document(): MarathonCsvDocument {
  return {
    marathon: {
      row: 1,
      slug: "drobi",
      title: "Дроби",
      subject: "math",
      description: "поріг 0,5",
      status: "draft",
      startDate: "2026-11-20",
      unlockHour: "09:00",
      reminderHour: "19:00",
      nudgeFrom: 10,
      nudgeUntil: 21,
      daysCount: 1,
      passThreshold: 60,
      finalCtaText: "Далі",
      finalCtaUrl: "https://nmt.in.ua",
      introVideoUrl: "",
      inviteAudience: "none",
      landingRiddleCount: 3,
      publicChatUrl: "",
    },
    days: [
      {
        row: 2,
        dayNumber: 1,
        topic: "Звичайні дроби",
        introText: "Вступ",
        materials: [{ row: 3, order: 1, type: "text", body: "Прочитай правило." }],
        tasks: [
          {
            row: 4,
            order: 1,
            questionId: 41,
            prompt: null,
            options: null,
            correct: null,
            explanation: null,
          },
        ],
      },
    ],
    riddles: [
      {
        row: 5,
        subject: "math",
        title: "Два плюс два",
        body: "Обери",
        hint: null,
        options: ["3", "4"],
        correct: 2,
      },
    ],
  };
}

test("json template names the format and version, and the sample slug is rejected", () => {
  const template = marathonJsonTemplate();
  const raw = JSON.parse(template) as { format: string; version: number };
  assert.equal(raw.format, MARATHON_JSON_FORMAT);
  assert.equal(raw.version, MARATHON_JSON_VERSION);
  const parsed = parseMarathonJson(template);
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.match(parsed.errors[0]?.message ?? "", /pryklad/);
});

test("json round-trips the nested marathon and rejects an unknown version", () => {
  const parsed = parseMarathonJson(documentToJson(document()));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.document.marathon.slug, "drobi");
  assert.equal(parsed.document.marathon.description, "поріг 0,5");
  assert.equal(parsed.document.days[0]?.materials[0]?.body, "Прочитай правило.");
  assert.equal(parsed.document.days[0]?.tasks[0]?.questionId, 41);
  assert.equal(parsed.document.riddles[0]?.correct, 2);

  const newer = documentToJson(document()).replace(`"version": ${MARATHON_JSON_VERSION}`, '"version": 2');
  const rejected = parseMarathonJson(newer);
  assert.equal(rejected.ok, false);
  if (rejected.ok) return;
  assert.match(rejected.errors[0]?.message ?? "", /version 1/);
});

test("json rejects a task that has both a bank id and a prompt", () => {
  const source = JSON.parse(documentToJson(document())) as {
    days: Array<{ tasks: Array<Record<string, unknown>> }>;
  };
  const day = source.days[0];
  const task = day?.tasks[0];
  assert.ok(task);
  task.prompt = "Своє формулювання";
  const parsed = parseMarathonJson(JSON.stringify(source));
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.match(parsed.errors.map((item) => item.message).join(" "), /не обидва/);
});

test("xlsx template has the five sheets and the sample slug is rejected", async () => {
  const bytes = await marathonWorkbookTemplate();
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer);
  assert.deepEqual(
    book.worksheets.map((sheet) => sheet.name),
    ["Марафон", "Дні", "Матеріали", "Завдання", "Загадки"],
  );
  assert.equal(book.getWorksheet(SHEET_MARATHON)?.getRow(2).getCell(1).value, "pryklad");
  const parsed = await parseMarathonWorkbook(bytes);
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.match(parsed.errors[0]?.message ?? "", /pryklad/);
});

test("xlsx round-trips a decimal comma and names the sheet when a task is both bank and handwritten", async () => {
  const parsed = await parseMarathonWorkbook(await documentToWorkbook(document()));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.document.marathon.description, "поріг 0,5");
  assert.equal(parsed.document.days[0]?.tasks[0]?.questionId, 41);
  assert.equal(parsed.document.riddles[0]?.options[1], "4");

  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(await documentToWorkbook(document())) as unknown as ExcelJS.Buffer);
  const tasks = book.getWorksheet(SHEET_TASKS);
  assert.ok(tasks);
  tasks.getRow(2).getCell(4).value = "Своє формулювання";
  const mixed = await parseMarathonWorkbook(new Uint8Array(await book.xlsx.writeBuffer()));
  assert.equal(mixed.ok, false);
  if (mixed.ok) return;
  assert.match(mixed.errors.map((item) => item.message).join(" "), /Завдання/);
  assert.match(mixed.errors.map((item) => item.message).join(" "), /не обидва/);
});

test("xlsx without a required sheet is rejected", async () => {
  const book = new ExcelJS.Workbook();
  book.addWorksheet("Інше");
  const parsed = await parseMarathonWorkbook(new Uint8Array(await book.xlsx.writeBuffer()));
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.match(parsed.errors[0]?.message ?? "", /Марафон/);
});
