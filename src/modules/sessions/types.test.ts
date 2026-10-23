import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLearningSessionRows,
  formatDurationSeconds,
  resolveSessionDisplayStatus,
  SESSION_STATUS_COMPLETED,
  SESSION_STATUS_CREATED,
  SESSION_STATUS_PLANNED,
  SESSION_TYPE_MENTOR,
  SESSION_TYPE_USER,
  sessionCreatedByLabel,
} from "./types";

const FAR_FUTURE = 9_999_999_999;
const NOW = 1_700_000_000;

test("resolveSessionDisplayStatus maps planned/unfinished vs. completed", () => {
  assert.equal(
    resolveSessionDisplayStatus({
      session_status: SESSION_STATUS_PLANNED,
      tasks_number: 10,
      right_number: 0,
      time: 0,
      expire_time: FAR_FUTURE,
    }),
    "planned"
  );
  assert.equal(
    resolveSessionDisplayStatus({
      session_status: SESSION_STATUS_COMPLETED,
      tasks_number: 10,
      right_number: 10,
      time: 50,
      expire_time: FAR_FUTURE,
    }),
    "completed"
  );
  assert.equal(
    resolveSessionDisplayStatus({
      session_status: SESSION_STATUS_CREATED,
      tasks_number: 10,
      right_number: 10,
      time: 50,
      expire_time: FAR_FUTURE,
    }),
    "completed"
  );
  assert.equal(
    resolveSessionDisplayStatus({
      session_status: SESSION_STATUS_CREATED,
      tasks_number: 5,
      right_number: 0,
      time: 0,
      expire_time: FAR_FUTURE,
    }),
    "planned"
  );
  assert.equal(
    resolveSessionDisplayStatus({
      session_status: SESSION_STATUS_CREATED,
      tasks_number: 5,
      right_number: 2,
      time: 30,
      expire_time: FAR_FUTURE,
    }),
    "planned"
  );
});

test("resolveSessionDisplayStatus reads expired instead of planned once the deadline passes", () => {
  assert.equal(
    resolveSessionDisplayStatus(
      {
        session_status: SESSION_STATUS_PLANNED,
        tasks_number: 10,
        right_number: 0,
        time: 0,
        expire_time: NOW - 1,
      },
      NOW
    ),
    "expired"
  );
});

test("resolveSessionDisplayStatus keeps a completed session completed past its deadline", () => {
  assert.equal(
    resolveSessionDisplayStatus(
      {
        session_status: SESSION_STATUS_COMPLETED,
        tasks_number: 10,
        right_number: 10,
        time: 50,
        expire_time: NOW - 1,
      },
      NOW
    ),
    "completed"
  );
});

test("buildLearningSessionRows formats an unfinished session as planned", () => {
  const rows = buildLearningSessionRows([
    {
      id: 12,
      theme_id: 2,
      theme_name: " Арифметичні дії ",
      tasks_number: 10,
      right_number: 8,
      time: 56,
      session_status: SESSION_STATUS_CREATED,
      session_type: 1,
      start_time: 0,
      expire_time: FAR_FUTURE,
      difficulty: null,
    },
  ]);

  assert.equal(rows[0]?.rowNumber, 1);
  assert.equal(rows[0]?.themeName, "Арифметичні дії");
  assert.equal(rows[0]?.percent, 80);
  assert.equal(rows[0]?.timePerTaskSec, 5.6);
  assert.equal(rows[0]?.createdByLabel, "Користувач");
  assert.equal(rows[0]?.status, "planned");
  assert.equal(rows[0]?.statusLabel, "Заплановано");
});

test("buildLearningSessionRows formats a completed session with percent and elapsed time", () => {
  const rows = buildLearningSessionRows([
    {
      id: 13,
      theme_id: 2,
      theme_name: "Арифметичні дії",
      tasks_number: 10,
      right_number: 8,
      time: 56,
      session_status: SESSION_STATUS_COMPLETED,
      session_type: 1,
      start_time: 1000,
      expire_time: FAR_FUTURE,
      difficulty: null,
    },
  ]);

  assert.equal(rows[0]?.status, "completed");
  assert.equal(rows[0]?.statusLabel, "Виконано");
  assert.equal(rows[0]?.percent, 80);
  assert.equal(rows[0]?.timeSec, 56);
});

test("sessionCreatedByLabel maps mentor sessions", () => {
  assert.equal(sessionCreatedByLabel(SESSION_TYPE_USER), "Користувач");
  assert.equal(sessionCreatedByLabel(SESSION_TYPE_MENTOR), "Ментор");
});

test("buildLearningSessionRows labels mentor planned session", () => {
  const rows = buildLearningSessionRows([
    {
      id: 20,
      theme_id: 4,
      theme_name: "Графіки",
      tasks_number: 10,
      right_number: 0,
      time: 0,
      session_status: SESSION_STATUS_PLANNED,
      session_type: SESSION_TYPE_MENTOR,
      start_time: 0,
      expire_time: FAR_FUTURE,
      difficulty: null,
    },
  ]);

  assert.equal(rows[0]?.createdByLabel, "Ментор");
  assert.equal(rows[0]?.status, "planned");
});

test("buildLearningSessionRows blocks start before available_at", () => {
  const availableAt = NOW + 3_600;
  const rows = buildLearningSessionRows(
    [
      {
        id: 22,
        theme_id: 4,
        theme_name: "Графіки",
        tasks_number: 10,
        right_number: 0,
        time: 0,
        session_status: SESSION_STATUS_PLANNED,
        session_type: SESSION_TYPE_MENTOR,
        start_time: 0,
        expire_time: availableAt + 86_400,
        available_at: availableAt,
        difficulty: null,
      },
    ],
    NOW
  );

  assert.equal(rows[0]?.status, "planned");
  assert.equal(rows[0]?.canStart, false);
  assert.equal(rows[0]?.availableAt, availableAt);
  assert.ok(rows[0]?.availableAtLabel);
});

test("session time is minutes and seconds, not a raw second count", () => {
  assert.equal(formatDurationSeconds(725), "12 хв 05 с");
  assert.equal(formatDurationSeconds(3600 + 3 * 60, "uk"), "1 год 03 хв");
  assert.equal(formatDurationSeconds(0), "—");
  assert.equal(formatDurationSeconds(3661, "en"), "1 h 01 min");
});
