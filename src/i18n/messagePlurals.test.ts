import assert from "node:assert/strict";
import test from "node:test";
import * as intlCore from "use-intl/core";
import de from "../../messages/de.json";
import en from "../../messages/en.json";
import uk from "../../messages/uk.json";

type Translator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

// The package types declare a default export; the runtime export is named.
const createTranslator = (
  intlCore as unknown as {
    createTranslator: (config: { locale: string; messages: typeof uk }) => Translator;
  }
).createTranslator;

function translate(locale: string, messages: typeof uk) {
  return createTranslator({ locale, messages });
}

const enMessages = en as typeof uk;
const deMessages = de as typeof uk;

test("ukrainian counts use день/дні/днів and бал/бали/балів", () => {
  const t = translate("uk", uk);
  const lead = (days: number) => t("Marathon.landingLead", { days });
  assert.match(lead(1), /^Безкоштовний 1 день математики/);
  assert.match(lead(21), /^Безкоштовний 21 день математики/);
  assert.match(lead(3), /^Безкоштовні 3 дні математики/);
  assert.match(lead(22), /^Безкоштовні 22 дні математики/);
  assert.match(lead(5), /^Безкоштовні 5 днів математики/);
  assert.match(lead(11), /^Безкоштовні 11 днів математики/);
  assert.match(lead(0), /^Безкоштовні 0 днів математики/);

  const points = (count: number) => t("Marathon.boardPoints", { count });
  assert.equal(points(1), "1 бал");
  assert.equal(points(21), "21 бал");
  assert.equal(points(3), "3 бали");
  assert.equal(points(23), "23 бали");
  assert.equal(points(5), "5 балів");
  assert.equal(points(8), "8 балів");
  assert.equal(points(10), "10 балів");
  assert.equal(points(11), "11 балів");
  assert.equal(points(0), "0 балів");
});

test("other ukrainian count nouns agree with the number", () => {
  const t = translate("uk", uk);
  assert.equal(t("Consultations.ratingSummary", { avg: "4.5", count: 1 }), "4.5 · 1 оцінка");
  assert.equal(t("Consultations.ratingSummary", { avg: "4.5", count: 3 }), "4.5 · 3 оцінки");
  assert.equal(t("Consultations.ratingSummary", { avg: "4.5", count: 5 }), "4.5 · 5 оцінок");
  assert.equal(t("simulator.tasksCount", { count: 1 }), "1 завдання");
  assert.equal(t("simulator.tasksCount", { count: 4 }), "4 завдання");
  assert.equal(t("simulator.tasksCount", { count: 5 }), "5 завдань");
  assert.match(t("TeacherSessions.assignedWarn", { count: 1 }), /призначено 1 раз\./);
  assert.match(t("TeacherSessions.assignedWarn", { count: 2 }), /призначено 2 рази\./);
  assert.match(t("TeacherSessions.assignedWarn", { count: 5 }), /призначено 5 разів\./);
  assert.match(t("AdminContent.pageStatus", { page: 1, totalPages: 1, total: 1 }), /1 завдання$/);
  assert.match(t("AdminContent.pageStatus", { page: 1, totalPages: 1, total: 21 }), /21 завдання$/);
  assert.match(t("AdminProfiles.pageStatus", { page: 1, totalPages: 1, total: 1 }), /1 акаунт$/);
  assert.match(t("FeedbackAdmin.pageStatus", { page: 1, totalPages: 1, total: 2 }), /2 відгуки$/);
});

test("english and german day and point counts agree", () => {
  const enT = translate("en", enMessages);
  assert.match(enT("Marathon.landingLead", { days: 1 }), /^1 free day of math/);
  assert.match(enT("Marathon.landingLead", { days: 3 }), /^3 free days of math/);
  assert.equal(enT("Marathon.boardPoints", { count: 1 }), "1 point");
  assert.equal(enT("Marathon.boardPoints", { count: 3 }), "3 points");
  assert.match(enT("TeacherSessions.assignedWarn", { count: 1 }), /assigned 1 time\./);

  const deT = translate("de", deMessages);
  assert.match(deT("Marathon.landingLead", { days: 1 }), /^1 kostenloser Mathe-Tag:/);
  assert.match(deT("Marathon.landingLead", { days: 3 }), /^3 kostenlose Mathe-Tage:/);
  assert.equal(deT("Marathon.boardPoints", { count: 1 }), "1 Punkt");
  assert.equal(deT("Marathon.boardPoints", { count: 3 }), "3 Punkte");
});
