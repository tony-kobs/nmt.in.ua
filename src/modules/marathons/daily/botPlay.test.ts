import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPlay,
  blankPlay,
  parseBotCallback,
  presentMarathon,
  type DayPacket,
  type GradedTask,
} from "./botPlay";

const EXPLANATION = "СЕКРЕТНЕ_ПОЯСНЕННЯ";

const tasks: GradedTask[] = [
  {
    id: 15,
    order: 1,
    prompt: "Скільки буде 2+2?",
    options: ["3", "4"],
    correct: 2,
    explanation: EXPLANATION,
  },
  {
    id: 16,
    order: 2,
    prompt: "Скільки буде 1+1?",
    options: ["2", "5"],
    correct: 1,
    explanation: null,
  },
];

function day(overrides: Partial<DayPacket> = {}): DayPacket {
  return {
    dayNumber: 1,
    topic: "Додавання",
    locked: false,
    unlockLabel: "10 січня, 09:00",
    pageUrl: "https://nmt.in.ua/marathon/math-5/day/1",
    materials: [{ type: "text", urlOrBody: "Прочитайте правило додавання." }],
    tasks,
    passThreshold: 60,
    daysCount: 2,
    next: {
      dayNumber: 2,
      topic: "Дроби",
      unlockLabel: "11 січня, 09:00",
      url: "https://nmt.in.ua/marathon/math-5/day/2",
    },
    finalUrl: "https://nmt.in.ua/marathon/math-5/final",
    ...overrides,
  };
}

const viewed = { ...blankPlay(), materialsViewed: true };

function blob(messages: { text: string }[]): string {
  return messages.map((item) => item.text).join("\n");
}

test("bot callbacks parse and a duplicate answer does not grade twice", () => {
  assert.deepEqual(parseBotCallback("mh:a:1:15:2"), {
    kind: "answer",
    day: 1,
    taskId: 15,
    option: 2,
  });
  const first = presentMarathon({
    callback: { kind: "answer", day: 1, taskId: 15, option: 2 },
    day: day(),
    state: viewed,
    name: "Марія",
    mapUrl: "https://nmt.in.ua/marathon/math-5/map",
  });
  assert.equal(first.completedNow, false);
  assert.equal(first.state.answers[15], 2);
  assert.equal(blob(first.messages).includes(EXPLANATION), false);
  assert.equal(blob(first.messages).includes("Правильна відповідь"), false);

  const duplicate = presentMarathon({
    callback: { kind: "answer", day: 1, taskId: 15, option: 2 },
    day: day(),
    state: first.state,
    name: "Марія",
    mapUrl: "https://nmt.in.ua/marathon/math-5/map",
  });
  assert.equal(duplicate.completedNow, false);
  assert.deepEqual(duplicate.state, first.state);
  assert.equal(blob(duplicate.messages).includes(EXPLANATION), false);

  const last = presentMarathon({
    callback: { kind: "answer", day: 1, taskId: 16, option: 1 },
    day: day(),
    state: duplicate.state,
    name: "Марія",
    mapUrl: "https://nmt.in.ua/marathon/math-5/map",
  });
  assert.equal(last.completedNow, true);
  assert.equal(last.state.score, 100);
  assert.equal(blob(last.messages).includes(EXPLANATION), true);
  assert.equal(blob(last.messages).includes("Дроби"), true);

  const again = presentMarathon({
    callback: { kind: "answer", day: 1, taskId: 16, option: 2 },
    day: day(),
    state: last.state,
    name: "Марія",
    mapUrl: "https://nmt.in.ua/marathon/math-5/map",
  });
  assert.equal(again.completedNow, false);
  assert.equal(again.state.score, last.state.score);
  assert.equal(again.state.answers[16], 1);
});

test("a locked day is refused and does not reveal the task", () => {
  const locked = day({ locked: true });
  const result = presentMarathon({
    callback: { kind: "today" },
    day: locked,
    state: viewed,
    name: "Марія",
    mapUrl: "https://nmt.in.ua/marathon/math-5/map",
  });
  assert.equal(result.completedNow, false);
  assert.deepEqual(result.state, viewed);
  assert.match(blob(result.messages), /10 січня, 09:00/);
  assert.equal(blob(result.messages).includes("2+2"), false);
  assert.equal(blob(result.messages).includes(EXPLANATION), false);
});

test("progress started in the bot can be finished on the site", () => {
  const opened = applyPlay(blankPlay(), { type: "materials" }, tasks, 60);
  const fromBot = applyPlay(
    opened.state,
    { type: "answer", taskId: 15, option: 1 },
    tasks,
    60,
  );
  assert.equal(fromBot.state.completed, false);
  assert.equal(fromBot.state.answers[15], 1);
  const fromSite = applyPlay(
    fromBot.state,
    { type: "submit", answers: { 15: 1, 16: 1 } },
    tasks,
    60,
  );
  assert.equal(fromSite.completedNow, true);
  assert.equal(fromSite.state.passed, false);
  const replay = applyPlay(
    fromSite.state,
    { type: "answer", taskId: 16, option: 2 },
    tasks,
    60,
  );
  assert.equal(replay.completedNow, false);
  assert.equal(replay.state.score, fromSite.state.score);
});
