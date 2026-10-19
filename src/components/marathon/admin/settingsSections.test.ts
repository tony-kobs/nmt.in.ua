import assert from "node:assert/strict";
import test from "node:test";
import { parseMarathonInput } from "@/modules/marathons/daily/forms";
import {
  formatIsoDate,
  invalidSectionIds,
  joinSummary,
  readSectionOpen,
  sectionFields,
  writeSectionOpen,
} from "./settingsSections";

test("invalid sections follow the page order", () => {
  assert.deepEqual(
    invalidSectionIds([
      { field: "inviteAudience" },
      { field: "slug" },
      { field: "landingRiddleCount" },
      { field: "form" },
    ]),
    ["basic", "landing", "notify"],
  );
});

test("every marathon field error belongs to a section", () => {
  const parsed = parseMarathonInput(new FormData());
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  const known = new Set([
    ...sectionFields("basic"),
    ...sectionFields("dates"),
    ...sectionFields("landing"),
    ...sectionFields("notify"),
    ...sectionFields("telegram"),
  ]);
  for (const issue of parsed.issues) {
    assert.equal(known.has(issue.field), true, issue.field);
  }
  assert.ok(parsed.issues.some((issue) => issue.field === "slug"));
  assert.ok(parsed.issues.some((issue) => issue.field === "finalCtaUrl"));
});

test("section storage keeps boolean flags only", () => {
  assert.equal(readSectionOpen(null, "basic"), null);
  assert.equal(readSectionOpen("{", "basic"), null);
  assert.equal(readSectionOpen(JSON.stringify({ basic: "yes" }), "basic"), null);
  const stored = writeSectionOpen(JSON.stringify({ basic: false, dates: 1, landing: true }), "dates", false);
  assert.equal(readSectionOpen(stored, "basic"), false);
  assert.equal(readSectionOpen(stored, "dates"), false);
  assert.equal(readSectionOpen(stored, "landing"), true);
  assert.equal(readSectionOpen(stored, "telegram"), null);
});

test("summaries skip empty parts and format the start date", () => {
  assert.equal(formatIsoDate("2026-10-19"), "19.10.2026");
  assert.equal(formatIsoDate("завтра"), "завтра");
  assert.equal(joinSummary(["  Математика ", "", null, "Чернетка"]), "Математика · Чернетка");
});
