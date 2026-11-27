import assert from "node:assert/strict";
import test from "node:test";
import { createTranslator } from "next-intl";

import de from "../../../messages/de.json";
import en from "../../../messages/en.json";
import uk from "../../../messages/uk.json";
import {
  assignedSessionNotification,
  noteMessageValues,
  readNoteMessage,
  topicTestReminder,
  type SiteNote,
} from "./studentNotes";

const MESSAGES = { uk, en, de } as const;
const CYRILLIC = /[Ѐ-ӿ]/;
const NOW = 1_780_000_000;

function render(note: SiteNote, locale: keyof typeof MESSAGES) {
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "Notifications" });
  const message = readNoteMessage(note.body);
  assert.ok(message, "a new note is stored as a message, not plain text");
  return {
    title: t(message.title),
    body: t(message.body, noteMessageValues(message, locale, t("unknownTheme"))),
  };
}

const assigned = (availableAt: number, themeName = "Дроби") =>
  assignedSessionNotification({
    themeName,
    tasksNumber: 5,
    sessionId: 12,
    availableAt,
    dueAt: NOW + 86_400,
    nowSec: NOW,
  });

test("student notes keep no Ukrainian text in what is stored", () => {
  for (const note of [assigned(NOW + 3600, ""), topicTestReminder({ themeName: "", sessionId: 3 })]) {
    assert.doesNotMatch(note.title, CYRILLIC);
    assert.doesNotMatch(note.body, CYRILLIC);
    assert.match(note.link, /^\/session\/\d+$/);
  }
});

for (const locale of ["en", "de"] as const) {
  test(`assigned and reminder notes read fully in ${locale}, dates included`, () => {
    for (const note of [
      assigned(NOW - 60, "Algebra"),
      assigned(NOW + 3600, "Algebra"),
      assigned(NOW + 3600, "  "),
      topicTestReminder({ themeName: "Algebra", sessionId: 3 }),
      topicTestReminder({ themeName: "", sessionId: 3 }),
    ]) {
      const shown = render(note, locale);
      assert.doesNotMatch(shown.title, CYRILLIC, shown.title);
      assert.doesNotMatch(shown.body, CYRILLIC, shown.body);
      assert.doesNotMatch(shown.body, /\{\w+\}/, "every placeholder is filled");
    }
  });
}

test("a note that opens later shows its start time, one that is open does not", () => {
  assert.match(render(assigned(NOW + 3600), "en").body, /Starts: /);
  assert.doesNotMatch(render(assigned(NOW - 60), "en").body, /Starts: /);
  assert.match(render(assigned(NOW + 3600), "uk").body, /Старт: .*Термін: /);
});

test("older plain-text notes and foreign JSON are shown as they are", () => {
  assert.equal(readNoteMessage("Завершіть тест за темою «Дроби»."), null);
  assert.equal(readNoteMessage("{not json"), null);
  assert.equal(readNoteMessage(JSON.stringify({ v: 1, title: "bell", body: "x", params: {} })), null);
});
