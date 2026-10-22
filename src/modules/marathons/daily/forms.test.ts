import assert from "node:assert/strict";
import test from "node:test";
import de from "../../../../messages/de.json";
import en from "../../../../messages/en.json";
import uk from "../../../../messages/uk.json";
import {
  DUPLICATE_DAY,
  DUPLICATE_ORDER,
  DUPLICATE_SLUG,
  FORM_INVALID,
  FORM_SERVER,
  QUESTION_MISSING,
  parseDay,
  parseDayUpdate,
  parseMarathonInput,
  parseMaterial,
  parseRiddle,
  parseTask,
  readInt,
  type FieldIssue,
} from "./forms";

function data(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  return form;
}

const validMarathon = {
  slug: "math-5",
  title: "П'ять днів",
  subject: "math",
  startDate: "2026-10-08",
  unlockHour: "09:00",
  daysCount: "5",
  passThreshold: "60",
  finalCtaText: "Далі",
  finalCtaUrl: "/",
};

function codes(issues: FieldIssue[]): string[] {
  return issues.map((issue) => `${issue.field}.${issue.code}`);
}

function assertCopy(issues: FieldIssue[]) {
  const catalogs = [uk, en, de] as const;
  for (const issue of issues) {
    for (const catalog of catalogs) {
      const bucket = (
        catalog.Marathon.fieldErrors as Record<string, Record<string, string>>
      )[issue.field];
      assert.equal(
        typeof bucket?.[issue.code],
        "string",
        `${issue.field}.${issue.code}`,
      );
      assert.ok(bucket?.[issue.code]?.trim(), `${issue.field}.${issue.code} empty`);
    }
  }
}

test("readInt treats a blank field as missing and keeps zero", () => {
  assert.equal(readInt(""), null);
  assert.equal(readInt("  "), null);
  assert.equal(readInt(null), null);
  assert.equal(readInt("0"), 0);
  assert.equal(readInt("10"), 10);
  assert.equal(readInt("10.5"), null);
});

test("empty marathon form names every missing field, including the start date", () => {
  const parsed = parseMarathonInput(data({}));
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.deepEqual(codes(parsed.issues), [
    "slug.required",
    "title.required",
    "startDate.required",
    "unlockHour.required",
    "daysCount.range",
    "passThreshold.range",
    "finalCtaText.required",
    "finalCtaUrl.required",
  ]);
  assertCopy(parsed.issues);
});

test("reminder hour and nudge window explain a bad clock", () => {
  const parsed = parseMarathonInput(data({
    ...validMarathon,
    reminderHour: "9:00",
    nudgeFrom: "21",
    nudgeUntil: "10",
  }));
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.deepEqual(codes(parsed.issues), ["reminderHour.format", "nudgeUntil.range"]);
  assertCopy(parsed.issues);
});

test("a cleared start date is the only marathon error when the rest is filled", () => {
  const parsed = parseMarathonInput(data({ ...validMarathon, startDate: "" }));
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.deepEqual(codes(parsed.issues), ["startDate.required"]);
});

test("marathon fields explain slug, clock, days, threshold, date and CTA", () => {
  const parsed = parseMarathonInput(
    data({
      ...validMarathon,
      slug: "Math_5",
      startDate: "2026-02-31",
      unlockHour: "9:00",
      daysCount: "15",
      passThreshold: "",
      finalCtaUrl: "javascript:alert(1)",
    }),
  );
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.deepEqual(codes(parsed.issues), [
    "slug.format",
    "startDate.format",
    "unlockHour.format",
    "daysCount.range",
    "passThreshold.range",
    "finalCtaUrl.format",
  ]);
  assertCopy(parsed.issues);
});

test("marathon input lowercases a valid slug and keeps the typed values' meaning", () => {
  const parsed = parseMarathonInput(
    data({
      ...validMarathon,
      slug: "Math-5",
      passThreshold: "0",
      daysCount: "14",
      finalCtaUrl: "https://nmt.in.ua/simulator",
    }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.slug, "math-5");
  assert.equal(parsed.value.passThreshold, 0);
  assert.equal(parsed.value.daysCount, 14);
  assert.equal(parsed.value.finalCtaUrl, "https://nmt.in.ua/simulator");
  assert.equal(parsed.value.inviteAudience, "none");
});

test("a public chat link is optional, and a bad one is named", () => {
  const blank = parseMarathonInput(data(validMarathon));
  assert.equal(blank.ok, true);
  if (blank.ok) assert.equal(blank.value.publicChatUrl, "");
  const kept = parseMarathonInput(data({ ...validMarathon, publicChatUrl: "https://t.me/nmt_math" }));
  assert.equal(kept.ok, true);
  if (kept.ok) assert.equal(kept.value.publicChatUrl, "https://t.me/nmt_math");
  const parsed = parseMarathonInput(data({ ...validMarathon, publicChatUrl: "javascript:alert(1)" }));
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.deepEqual(codes(parsed.issues), ["publicChatUrl.format"]);
  assertCopy(parsed.issues);
});

test("a blank invite audience stays nobody, and an unknown value is named", () => {
  const kept = parseMarathonInput(data({ ...validMarathon, inviteAudience: "students" }));
  assert.equal(kept.ok, true);
  if (kept.ok) assert.equal(kept.value.inviteAudience, "students");
  const parsed = parseMarathonInput(data({ ...validMarathon, inviteAudience: "teachers" }));
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.deepEqual(codes(parsed.issues), ["inviteAudience.format"]);
  assertCopy(parsed.issues);
});

test("riddle, day and material parsers point at the empty or bad field", () => {
  const riddle = parseRiddle(data({
    title: "А",
    body: "",
    scope: "class",
    option1: "один",
    correct: "2",
  }));
  assert.equal(riddle.ok, false);
  if (!riddle.ok) {
    assert.deepEqual(codes(riddle.issues), [
      "title.required",
      "body.required",
      "scope.format",
      "options.required",
      "correct.choice",
    ]);
    assertCopy(riddle.issues);
  }

  const ready = parseRiddle(data({
    title: "Скриня",
    body: "Як передати скриню?",
    scope: "shared",
    subject: "math",
    hint: "Два замки",
    option1: "Окремим листом",
    option2: "Кожен знімає лише свій замок",
    option3: "Окремим листом",
    correct: "2",
  }));
  assert.equal(ready.ok, false);
  if (!ready.ok) {
    assert.deepEqual(codes(ready.issues), ["options.duplicate"]);
    assertCopy(ready.issues);
  }

  const saved = parseRiddle(data({
    title: "Скриня",
    body: "Як передати скриню?",
    scope: "marathon",
    subject: "math",
    option1: "Окремим листом",
    option3: "Кожен знімає лише свій замок",
    correct: "3",
  }));
  assert.equal(saved.ok, true);
  if (saved.ok) {
    assert.deepEqual(saved.value.options, ["Окремим листом", "Кожен знімає лише свій замок"]);
    assert.equal(saved.value.correct, 2);
    assert.equal(saved.value.scope, "marathon");
  }

  const day = parseDay(data({ dayNumber: "15", topic: "А" }));
  assert.equal(day.ok, false);
  if (!day.ok) {
    assert.deepEqual(codes(day.issues), ["dayNumber.range", "topic.required"]);
    assertCopy(day.issues);
  }

  const missingDay = parseDay(data({ dayNumber: "", topic: "Дроби" }));
  assert.equal(missingDay.ok, false);
  if (!missingDay.ok) assert.deepEqual(codes(missingDay.issues), ["dayNumber.required"]);

  const topic = parseDayUpdate(data({ topic: "А", introText: "вступ" }));
  assert.equal(topic.ok, false);
  if (!topic.ok) assert.deepEqual(codes(topic.issues), ["topic.required"]);

  const youtube = parseMaterial(
    data({ order: "2", materialType: "youtube", urlOrBody: "https://example.com/watch" }),
  );
  assert.equal(youtube.ok, false);
  if (!youtube.ok) {
    assert.deepEqual(codes(youtube.issues), ["urlOrBody.youtube"]);
    assertCopy(youtube.issues);
  }

  const loom = parseMaterial(
    data({
      order: "0",
      materialType: "loom",
      urlOrBody: "https://loom.com.evil/share/abcdef1234567890",
    }),
  );
  assert.equal(loom.ok, false);
  if (!loom.ok) {
    assert.deepEqual(codes(loom.issues), ["order.range", "urlOrBody.loom"]);
    assertCopy(loom.issues);
  }

  const text = parseMaterial(
    data({ order: "1", materialType: "text", urlOrBody: "Короткий конспект" }),
  );
  assert.equal(text.ok, true);

  const video = parseMaterial(
    data({
      order: "3",
      materialType: "youtube",
      urlOrBody: "https://youtu.be/dQw4w9WgXcQ",
    }),
  );
  assert.equal(video.ok, true);
  if (video.ok) assert.equal(video.value.type, "youtube");
});

test("task parser accepts a bank id or explains a broken inline question", () => {
  const bank = parseTask(data({ order: "1", questionId: "42" }));
  assert.equal(bank.ok, true);
  if (bank.ok) assert.equal(bank.value.mode, "bank");

  const inline = parseTask(
    data({
      order: "",
      prompt: "",
      option1: "а",
      option2: "",
      correct: "3",
    }),
  );
  assert.equal(inline.ok, false);
  if (!inline.ok) {
    assert.deepEqual(codes(inline.issues), [
      "order.required",
      "prompt.required",
      "options.required",
      "correct.range",
    ]);
    assertCopy(inline.issues);
  }

  const ready = parseTask(
    data({
      order: "4",
      prompt: "Скільки буде 2+2?",
      option1: "3",
      option2: "4",
      correct: "2",
    }),
  );
  assert.equal(ready.ok, true);
  if (ready.ok && ready.value.mode === "inline") {
    assert.deepEqual(ready.value.options, ["3", "4"]);
    assert.equal(ready.value.correct, 2);
  }
});

test("duplicate and server issues name a field and have copy in uk, en and de", () => {
  assertCopy([
    DUPLICATE_SLUG,
    DUPLICATE_DAY,
    DUPLICATE_ORDER,
    FORM_SERVER,
    FORM_INVALID,
    QUESTION_MISSING,
  ]);
});
