import assert from "node:assert/strict";
import test from "node:test";
import de from "../../../../messages/de.json";
import en from "../../../../messages/en.json";
import uk from "../../../../messages/uk.json";
import {
  COPY_DEFAULTS,
  COPY_KEYS,
  COPY_PREVIEW_SAMPLE,
  copyLengthWarning,
  renderCopy,
  unknownPlaceholders,
} from "./copy";
import { parseCopyInput, parseMarathonInput } from "./forms";

function data(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  return form;
}

test("templates substitute known placeholders and leave unknown ones untouched", () => {
  assert.equal(
    renderCopy("День {day}: {topic} для {name}. {unlock_time} {link} {nope}", {
      ...COPY_PREVIEW_SAMPLE,
      day: 2,
    }),
    "День 2: Дроби для Марія. 10 жовтня, 09:00 https://nmt.in.ua/marathon/math-5/day/2 {nope}",
  );
  assert.deepEqual(unknownPlaceholders("Привіт {name} {Foo} {day}"), ["Foo"]);
  assert.deepEqual(unknownPlaceholders(COPY_DEFAULTS.intro_rules), []);
});

test("copy form rejects an unknown placeholder and a bad key", () => {
  const bad = parseCopyInput(data({
    copyKey: "intro_rules",
    body: "Привіт, {name}. Завтра {when}.",
  }));
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.deepEqual(bad.issues, [{ field: "body", code: "placeholder" }]);

  const missing = parseCopyInput(data({ copyKey: "intro_rules", body: "  " }));
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.issues[0]?.code, "required");

  const unknown = parseCopyInput(data({ copyKey: "nope", body: "Текст" }));
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.issues[0]?.code, "unknown");

  const ok = parseCopyInput(data({
    copyKey: "notify_tomorrow",
    body: "Далі день {day}: {topic}. {unlock_time}\n{link}",
  }));
  assert.equal(ok.ok, true);
});

test("admin preview warns when a template exceeds the Telegram limit", () => {
  assert.equal(copyLengthWarning("bot_btn_today", "Сьогодні"), null);
  assert.equal(copyLengthWarning("bot_btn_today", "Я".repeat(70)), "button");
  assert.equal(copyLengthWarning("bot_menu", "А".repeat(4097)), "message");
});

test("uk, en and de name every copy field and the placeholder error", () => {
  for (const catalog of [uk, en, de]) {
    const labels = catalog.Marathon.copy.labels;
    for (const key of COPY_KEYS) {
      assert.equal(typeof labels[key], "string", key);
      assert.ok(labels[key].trim(), key);
    }
    assert.ok(catalog.Marathon.fieldErrors.body.placeholder.includes("name"));
    assert.ok(catalog.Marathon.fieldErrors.introVideo.format.trim());
    assert.ok(catalog.Marathon.fieldErrors.copyKey.unknown.trim());
  }
});

test("intro video accepts Loom and YouTube and rejects anything else", () => {
  const base = {
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
  const empty = parseMarathonInput(data(base));
  assert.equal(empty.ok, true);
  if (empty.ok) assert.equal(empty.value.introVideoUrl, "");
  const video = parseMarathonInput(data({
    ...base,
    introVideoUrl: "https://www.youtube.com/watch?v=abcdefghijk",
  }));
  assert.equal(video.ok, true);
  const bad = parseMarathonInput(data({ ...base, introVideoUrl: "https://example.com/clip" }));
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.deepEqual(bad.issues, [{ field: "introVideo", code: "format" }]);
});
