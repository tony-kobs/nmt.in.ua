import assert from "node:assert/strict";
import test from "node:test";

import { clampHour, flag, mapMarathon, standingTime } from "./db";

function marathonRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 4,
    slug: "vesna",
    title: "Весна",
    description: "  Короткий курс  ",
    subject: "math",
    start_date: "2026-03-01",
    unlock_hour: "09:00:00",
    reminder_hour: null,
    nudge_from: 8,
    nudge_until: 21,
    days_count: 5,
    pass_threshold: 60,
    final_cta_text: null,
    final_cta_url: null,
    intro_video_url: null,
    invite_audience: "students",
    landing_riddle_count: 4,
    public_chat_url: " https://t.me/example ",
    status: "active",
    ...overrides,
  };
}

test("mapMarathon trims fields and drops a row without a readable start", () => {
  const mapped = mapMarathon(marathonRow());
  assert.ok(mapped);
  assert.equal(mapped?.description, "Короткий курс");
  assert.equal(mapped?.unlockHour, "09:00");
  assert.equal(mapped?.reminderHour, "19:00");
  assert.equal(mapped?.inviteAudience, "students");
  assert.equal(mapped?.landingRiddleCount, 4);
  assert.equal(mapped?.publicChatUrl, "https://t.me/example");
  assert.equal(mapped?.finalCtaText, "");

  assert.equal(mapMarathon(marathonRow({ status: "paused" })), null);
  assert.equal(mapMarathon(marathonRow({ start_date: "not-a-date" })), null);
  const draft = mapMarathon(marathonRow({ status: "draft", start_date: "" }), {
    requireStart: false,
  });
  assert.equal(draft?.startDate, "");
  assert.equal(draft?.status, "draft");
});

test("mapMarathon clamps hours and unknown invite audience", () => {
  const mapped = mapMarathon(
    marathonRow({
      slug: "onemath",
      nudge_from: 24,
      nudge_until: -3,
      invite_audience: "everyone",
      landing_riddle_count: 99,
      public_chat_url: "  ",
    }),
  );
  assert.equal(mapped?.nudgeFrom, 10);
  assert.equal(mapped?.nudgeUntil, 21);
  assert.equal(mapped?.inviteAudience, "none");
  assert.equal(mapped?.landingRiddleCount, 3);
  assert.equal(mapped?.publicChatUrl, "https://t.me/nmt_onemath");
});

test("standingTime is known only when every finished day stored a duration", () => {
  assert.equal(standingTime(0, 0, 0), null);
  assert.equal(standingTime(2, 1, 40), null);
  assert.equal(standingTime(2, 2, 90.9), 90);
  assert.equal(standingTime(2, 2, -1), null);
  assert.equal(standingTime("2", "2", "15"), 15);
});

test("clampHour and flag keep the stored boundaries", () => {
  assert.equal(clampHour(0, 10), 0);
  assert.equal(clampHour(23, 10), 23);
  assert.equal(clampHour(24, 10), 10);
  assert.equal(clampHour(1.5, 10), 10);
  assert.equal(clampHour("8", 10), 8);
  assert.equal(flag(1), true);
  assert.equal(flag("1"), true);
  assert.equal(flag(true), true);
  assert.equal(flag(0), false);
  assert.equal(flag("0"), false);
});
