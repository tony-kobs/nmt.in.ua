import assert from "node:assert/strict";
import test from "node:test";
import {
  CSV_SAMPLE_SLUG,
  MARATHON_CSV_COLUMNS,
  documentToCsv,
  marathonCsvTemplate,
  missingQuestionIssues,
  parseMarathonCsv,
  type MarathonCsvDocument,
} from "./marathonCsv";

function document(): MarathonCsvDocument {
  return {
    marathon: {
      row: 2,
      slug: "drobi",
      title: "Дроби",
      subject: "math",
      description: "Пʼять днів",
      status: "draft",
      startDate: "2026-11-20",
      unlockHour: "09:00",
      reminderHour: "19:00",
      nudgeFrom: 10,
      nudgeUntil: 21,
      daysCount: 2,
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
        row: 3,
        dayNumber: 1,
        topic: "Звичайні дроби",
        introText: "Вступ",
        materials: [{ row: 4, order: 1, type: "text", body: "Прочитай правило." }],
        tasks: [
          {
            row: 5,
            order: 1,
            questionId: 41,
            prompt: null,
            options: null,
            correct: null,
            explanation: null,
          },
          {
            row: 6,
            order: 2,
            questionId: null,
            prompt: "Скільки буде 1/2+1/2?",
            options: ["1", "1/2"],
            correct: 1,
            explanation: null,
          },
        ],
      },
    ],
    riddles: [
      {
        row: 7,
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

test("the template has the header and an example row, and import rejects the sample slug", () => {
  const raw = marathonCsvTemplate();
  assert.equal(raw.charCodeAt(0), 0xfeff);
  assert.match(raw, /^#|^\uFEFF#/u);
  assert.match(raw, /# Як заповнити файл марафону/);
  const csv = raw.replace(/^\uFEFF/, "");
  const header = csv.split(/\r?\n/).find((line) => line.startsWith("row_type;"));
  assert.equal(header, MARATHON_CSV_COLUMNS.join(";"));
  assert.match(csv, new RegExp(`marathon;${CSV_SAMPLE_SLUG};`));
  const parsed = parseMarathonCsv(marathonCsvTemplate());
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.equal(parsed.errors.length, 1);
    assert.match(parsed.errors[0]?.message ?? "", /pryklad/);
  }
});

test("a semicolon, a decimal comma and a formula prefix round-trip through the parser", () => {
  const source = document();
  source.marathon.title = "=Дроби; частина 1";
  source.days[0]!.introText = "Поріг 0,5\nдругий";
  const csv = documentToCsv(source);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv, /0,5/);
  const parsed = parseMarathonCsv(csv);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.document.marathon.title, "=Дроби; частина 1");
  assert.equal(parsed.document.days[0]?.introText, "Поріг 0,5\nдругий");
  assert.deepEqual(
    parsed.document.days[0]?.tasks.map((task) => task.questionId ?? task.prompt),
    [41, "Скільки буде 1/2+1/2?"],
  );
  assert.equal(parsed.document.riddles[0]?.correct, 2);
});

test("row errors name the file row and do not return a partial document", () => {
  const source = document();
  source.days[0]!.tasks[0]!.questionId = null;
  const parsed = parseMarathonCsv(documentToCsv(source));
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.ok(parsed.errors.length >= 1);
  assert.equal(parsed.errors[0]?.row, 5);
  assert.match(parsed.errors.map((item) => item.message).join(" "), /question_id|формулювання/);
  assert.equal("document" in parsed, false);
});

test("a task cannot be both a bank id and a handwritten prompt", () => {
  const source = document();
  const csv = documentToCsv(source);
  const mixed = csv.replace(
    /;1;41;;;;;/,
    ";1;41;Своє формулювання;1 | 2;1;;",
  );
  const parsed = parseMarathonCsv(mixed);
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.match(parsed.errors.map((item) => item.message).join(" "), /не обидва/);
});

test("a material for a missing day and a duplicate day are separate row errors", () => {
  const cell = (values: Partial<Record<(typeof MARATHON_CSV_COLUMNS)[number], string>>) =>
    MARATHON_CSV_COLUMNS.map((column) => values[column] ?? "").join(";");
  const csv = [
    MARATHON_CSV_COLUMNS.join(";"),
    cell({
      row_type: "marathon",
      slug: "drobi",
      title: "Дроби",
      subject: "math",
      status: "draft",
      start_date: "2026-11-20",
      unlock_hour: "09:00",
      reminder_hour: "19:00",
      nudge_from: "10",
      nudge_until: "21",
      days_count: "14",
      pass_threshold: "60",
      final_cta_text: "Далі",
      final_cta_url: "https://nmt.in.ua",
      invite_audience: "none",
      landing_riddle_count: "3",
    }),
    cell({ row_type: "day", slug: "drobi", day_number: "1", topic: "Дроби", intro_text: "Вступ" }),
    cell({ row_type: "day", slug: "drobi", day_number: "1", topic: "Ще раз", intro_text: "Вступ" }),
    cell({
      row_type: "material",
      slug: "drobi",
      day_number: "9",
      material_order: "1",
      material_type: "text",
      material_body: "Текст",
    }),
  ].join("\n");
  const parsed = parseMarathonCsv(csv);
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.equal(parsed.errors.length, 2);
  assert.match(parsed.errors[0]?.message ?? "", /уже є/);
  assert.match(parsed.errors[1]?.message ?? "", /day/);
});

test("a riddle with the correct index outside the options is rejected", () => {
  const source = document();
  source.riddles[0]!.correct = 9;
  const parsed = parseMarathonCsv(documentToCsv(source));
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.match(parsed.errors.map((item) => item.message).join(" "), /загадки/);
});

test("a comma-separated file is rejected and a decimal comma stays in the cell", () => {
  const comma = marathonCsvTemplate().replace(/^\uFEFF/, "").replaceAll(";", ",");
  const parsed = parseMarathonCsv(comma);
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.equal(parsed.errors[0]?.message, "Роздільник має бути ;");

  const source = document();
  source.marathon.description = "поріг 0,5 і ще 1,25";
  const again = parseMarathonCsv(documentToCsv(source));
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.document.marathon.description, "поріг 0,5 і ще 1,25");
});

test("instructions and the sample slug stay out of the imported document", () => {
  const source = document();
  const csv = documentToCsv(source);
  assert.match(csv, /# 10\. У адмінці/);
  assert.match(csv, new RegExp(`marathon;${CSV_SAMPLE_SLUG};`));
  const parsed = parseMarathonCsv(csv);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.document.marathon.slug, "drobi");
  assert.equal(parsed.document.days.length, 1);
  assert.equal(parsed.document.riddles.length, 1);
  const blob = JSON.stringify(parsed.document);
  assert.equal(blob.includes(CSV_SAMPLE_SLUG), false);
  assert.equal(blob.includes("Як заповнити файл"), false);
  assert.equal(blob.includes("Приклад марафону"), false);
});

test("missing published question ids are reported on their own rows", () => {
  const parsed = parseMarathonCsv(documentToCsv(document()));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const issues = missingQuestionIssues(parsed.document, new Set([99]));
  assert.equal(issues.length, 1);
  assert.match(issues[0]?.message ?? "", /41/);
  assert.equal(missingQuestionIssues(parsed.document, new Set([41])).length, 0);
});
