import assert from "node:assert/strict";
import test from "node:test";
import type { LearningSessionRow } from "@/modules/sessions/types";
import {
  buildTodayPlans,
  pickOpenMarathonDay,
  pickTodayAdvice,
  pickTodayAssignments,
  type TodayAssignment,
} from "./pickStudentToday";

function row(
  partial: Partial<LearningSessionRow> & Pick<LearningSessionRow, "id">,
): LearningSessionRow {
  return {
    rowNumber: 1,
    themeId: 1,
    difficulty: 1,
    themeName: "Дроби",
    tasksNumber: 10,
    rightNumber: 0,
    percent: null,
    timeSec: 0,
    timePerTaskSec: null,
    startTimeLabel: "—",
    availableAt: null,
    availableAtLabel: null,
    dueAt: null,
    dueAtLabel: null,
    canStart: true,
    createdByLabel: "Ментор",
    createdBy: "mentor",
    status: "planned",
    statusLabel: "Заплановано",
    ...partial,
  };
}

test("pickTodayAssignments keeps planned mentor sessions, soonest due first", () => {
  const picked = pickTodayAssignments([
    row({ id: 3, themeName: "Пізніше", dueAt: 300, dueAtLabel: "пізніше" }),
    row({ id: 1, createdBy: "user", themeName: "Своя" }),
    row({ id: 2, status: "completed", themeName: "Здана" }),
    row({ id: 4, themeName: "Раніше", dueAt: 100, dueAtLabel: "раніше" }),
    row({
      id: 5,
      themeName: "Чекає",
      dueAt: 50,
      canStart: false,
      availableAtLabel: "завтра",
    }),
  ]);

  assert.deepEqual(
    picked.items.map((item) => item.themeName),
    ["Чекає", "Раніше", "Пізніше"],
  );
  assert.equal(picked.items[0]?.canStart, false);
  assert.equal(picked.more, 0);
});

test("pickTodayAssignments reports assignments past the limit", () => {
  const picked = pickTodayAssignments(
    [1, 2, 3, 4].map((id) => row({ id, dueAt: id })),
    3,
  );
  assert.equal(picked.items.length, 3);
  assert.equal(picked.more, 1);
});

test("pickOpenMarathonDay opens the day even before channel setup", () => {
  const day = pickOpenMarathonDay({
    slug: "math-5",
    title: "Марафон",
    days: [{ dayNumber: 1, topic: "Дроби", open: true, completed: false }],
  });
  assert.equal(day.state, "day");
  assert.equal(day.href, "/marathon/math-5/day/1");
});

test("pickOpenMarathonDay chooses the earliest open day that is not submitted", () => {
  const day = pickOpenMarathonDay({
    slug: "math-5",
    title: "Марафон",
    days: [
      { dayNumber: 1, topic: "Дроби", open: true, completed: true },
      { dayNumber: 2, topic: "Відсотки", open: true, completed: false },
      { dayNumber: 3, topic: "Рівняння", open: false, completed: false },
    ],
  });
  assert.equal(day.state, "day");
  assert.equal(day.dayNumber, 2);
  assert.equal(day.topic, "Відсотки");
  assert.equal(day.href, "/marathon/math-5/day/2");
});

test("pickOpenMarathonDay marks the window done when every open day is submitted", () => {
  const day = pickOpenMarathonDay({
    slug: "math-5",
    title: "Марафон",
    days: [{ dayNumber: 1, topic: "Дроби", open: true, completed: true }],
  });
  assert.equal(day.state, "done");
  assert.equal(day.href, "/marathon/math-5/map");
});

test("pickOpenMarathonDay waits while every day is still locked", () => {
  const day = pickOpenMarathonDay({
    slug: "math-5",
    title: "Марафон",
    days: [{ dayNumber: 1, topic: "Дроби", open: false, completed: false }],
  });
  assert.equal(day.state, "waiting");
});

function assignment(themeName = "Дроби"): TodayAssignment {
  return {
    sessionId: 9,
    themeName,
    tasksNumber: 10,
    dueAtLabel: "сьогодні",
    canStart: true,
    availableAtLabel: null,
  };
}

test("buildTodayPlans: a new student gets one starter rail", () => {
  const plans = buildTodayPlans({
    assignments: [],
    assignmentsMore: 0,
    marathon: null,
    join: { title: "Математика", slug: "math-5" },
    linkedToTeacher: false,
    advice: null,
  });
  assert.deepEqual(
    plans.map((plan) => plan.id),
    ["topic", "simulator", "marathon-join", "teacher", "textbook"],
  );
  const join = plans.find((plan) => plan.id === "marathon-join");
  assert.equal(join && join.id === "marathon-join" ? join.href : "", "/marathon/math-5");
});

test("buildTodayPlans: assignment, a joined marathon and a tip replace the generic twins", () => {
  const plans = buildTodayPlans({
    assignments: [assignment()],
    assignmentsMore: 1,
    marathon: {
      state: "day",
      title: "Марафон",
      dayNumber: 2,
      topic: "Відсотки",
      href: "/marathon/math-5/day/2",
    },
    join: { title: "Інший", slug: "other" },
    linkedToTeacher: true,
    advice: {
      title: "Матеріали",
      reason: "дві помилки",
      href: "/materials/textbook?topic=fractions",
    },
  });
  assert.deepEqual(
    plans.map((plan) => plan.id),
    ["assignment", "simulator", "marathon", "advice"],
  );
});

test("buildTodayPlans omits marathon and teacher cards when they do not apply", () => {
  const plans = buildTodayPlans({
    assignments: [],
    assignmentsMore: 0,
    marathon: null,
    join: null,
    linkedToTeacher: true,
    advice: null,
  });
  assert.deepEqual(
    plans.map((plan) => plan.id),
    ["topic", "simulator", "textbook"],
  );
});

test("pickTodayAdvice keeps a single first action", () => {
  assert.equal(pickTodayAdvice([]), null);
  assert.deepEqual(
    pickTodayAdvice([
      {
        type: "materials",
        title: "Матеріали",
        reason: "дві помилки",
        href: "/materials/textbook?topic=fractions",
        priority: 1,
      },
      {
        type: "topic-test",
        title: "Ще раз",
        reason: "практика",
        href: "/?theme=4",
        priority: 2,
      },
    ]),
    {
      title: "Матеріали",
      reason: "дві помилки",
      href: "/materials/textbook?topic=fractions",
    },
  );
});
