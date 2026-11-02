import assert from "node:assert/strict";
import test from "node:test";

import { applyChangelog, parseReleaseNotes } from "./record-changelog.mjs";

const changelog = `# Журнал

<!-- changelog:entries -->
<!-- /changelog:entries -->

## Новини

<!-- changelog:news -->
Поки що новин немає.
<!-- /changelog:news -->
`;

const meta = {
  number: "9",
  title: "docs: розігрів",
  url: "https://example.com/9",
  author: "student",
  mergedAt: "2026-11-02T00:00:00Z",
};

test("a guide without the wiki mirror is left unchanged", () => {
  const guide = "# Гід\n\nбез дзеркала\n";
  const notes = parseReleaseNotes("## Для команди\n\nКоротко про зміну.\n", meta.title);
  const next = applyChangelog({
    changelog,
    onboarding: guide,
    notes,
    target: "dev",
    meta,
  });
  assert.equal(next.onboarding, guide);
  assert.match(next.changelog, /#9/);
  assert.match(next.changelog, /Коротко про зміну/);
});

test("wiki markers still receive the latest entries", () => {
  const guide = "# Гід\n\n<!-- changelog:wiki -->\nстаре\n<!-- /changelog:wiki -->\n";
  const notes = parseReleaseNotes("## Для команди\n\nНовий запис.\n", meta.title);
  const next = applyChangelog({
    changelog,
    onboarding: guide,
    notes,
    target: "dev",
    meta,
  });
  assert.match(next.onboarding, /Новий запис/);
  assert.doesNotMatch(next.onboarding, /старе/);
});

test("the hand-in checklist does not leak into the team note", () => {
  const body = [
    "## Для команди",
    "",
    "Лише цей абзац.",
    "",
    "## Для учня і викладача",
    "",
    "На сайті нічого.",
    "",
    "## Скрінкаст",
    "",
    "- [x] потрібен",
    "- [ ] схвалено показувати",
    "- Посилання: https://example.com/video",
    "",
    "## Здано",
    "",
    "- [x] `npm test` зелений",
    "Цей рядок не для журналу.",
  ].join("\n");
  const notes = parseReleaseNotes(body, "feat: x");
  assert.equal(notes.team, "Лише цей абзац.");
  assert.equal(notes.people, "На сайті нічого.");
  assert.equal(notes.needed, true);
  assert.equal(notes.link, "https://example.com/video");
  assert.equal(notes.team.includes("npm test"), false);
});
