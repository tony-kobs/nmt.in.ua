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
    introText: null,
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
  assert.deepEqual(parseBotCallback("mh:quiz"), { kind: "quiz" });
  assert.deepEqual(parseBotCallback("mh:qn:4:10"), { kind: "quizStart", themeId: 4, count: 10 });
  assert.deepEqual(parseBotCallback("mh:qa:9:15:2"), {
    kind: "quizAnswer",
    attempt: 1,
    sessionId: 9,
    mappingId: 15,
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

test("callback data hides the task and the correct option behind an opaque token", () => {
  const issued: Array<{ day: number; taskId: number; option: number }> = [];
  const result = presentMarathon({
    callback: { kind: "today" },
    day: day(),
    state: viewed,
    name: "Марія",
    mapUrl: "https://nmt.in.ua/marathon/math-5/map",
    tokenFor: (action) => {
      issued.push(action);
      return `mh:z:token${action.option}xxxxxxxx`;
    },
  });
  const buttons = result.messages.flatMap((message) => message.buttons ?? []);
  const answer = buttons.find((button) => button.data?.startsWith("mh:z:"));
  assert.ok(answer?.data);
  assert.equal(answer.data.includes("15"), false);
  assert.equal(answer.data.includes(EXPLANATION), false);
  assert.equal(/:2$/.test(answer.data), false);
  assert.equal(issued[0]?.taskId, 15);
  assert.equal(issued[0]?.option, 1);
  const taskMessage = result.messages.find((message) => message.text.includes("2+2"));
  assert.ok(taskMessage);
  assert.equal(taskMessage.siteUrl, undefined);
  assert.equal(taskMessage.buttons?.some((button) => button.url), false);
  assert.equal(taskMessage.buttons?.[0]?.text, "А. 3");
  assert.equal(blob(result.messages).includes(EXPLANATION), false);
});

test("a marathon formula task stays one message and the site link waits for a failed picture", () => {
  const result = presentMarathon({
    callback: { kind: "today" },
    day: day({
      tasks: [
        {
          ...tasks[0],
          prompt: "Спростіть вираз $\\begin{cases}x\\\\y\\end{cases}$.",
          options: ["$5x$", "$6x$"],
        },
        tasks[1],
      ],
    }),
    state: viewed,
    name: "Марія",
    mapUrl: "https://nmt.in.ua/marathon/math-5/map",
  });
  const formulaMessages = result.messages.filter((message) => message.formulaTex || message.text.includes("Спростіть"));
  assert.equal(formulaMessages.length, 1);
  const task = formulaMessages[0]!;
  assert.match(task.text, /Спростіть вираз/);
  assert.match(task.text, /А\. 5x/);
  assert.match(task.text, /Б\. 6x/);
  assert.equal(task.siteOnFail, true);
  assert.equal(task.siteUrl, "https://nmt.in.ua/marathon/math-5/day/1");
  assert.equal(task.buttons?.some((button) => button.url), false);
  assert.equal(task.buttons?.[0]?.text, "А. 5x");
  assert.equal(task.text.trim() === ".", false);
  assert.equal(blob(result.messages).includes(EXPLANATION), false);
});

test("a formula task answered in the bot can be finished on the site", () => {
  const formulaTasks: GradedTask[] = [
    { ...tasks[0], prompt: "Обчисліть $x^2$" },
    tasks[1],
  ];
  const opened = applyPlay(blankPlay(), { type: "materials" }, formulaTasks, 60);
  const fromBot = applyPlay(
    opened.state,
    { type: "answer", taskId: 15, option: 2 },
    formulaTasks,
    60,
  );
  assert.equal(fromBot.state.answers[15], 2);
  assert.equal(fromBot.state.completed, false);
  const fromSite = applyPlay(
    fromBot.state,
    { type: "submit", answers: { 15: 2, 16: 1 } },
    formulaTasks,
    60,
  );
  assert.equal(fromSite.completedNow, true);
  assert.equal(fromSite.state.score, 100);
});

test("marathon menu drops generic practice and can return home", () => {
  const result = presentMarathon({
    callback: { kind: "menu" },
    day: null,
    state: blankPlay(),
    name: "Марія",
    mapUrl: "https://nmt.in.ua/marathon/math-5/map",
  });
  const buttons = result.messages.flatMap((message) => message.buttons ?? []);
  assert.equal(buttons.some((button) => button.text === "Пройти тестування" || button.data === "mh:quiz"), false);
  assert.equal(buttons.some((button) => button.data === "mh:today"), true);
  assert.equal(buttons.some((button) => button.url?.endsWith("/map")), true);
  assert.equal(buttons.some((button) => button.text === "🏠 Головне меню" && button.data === "m:home"), true);
});

test("a marathon day keeps answer buttons inline and offers the main menu", () => {
  const result = presentMarathon({
    callback: { kind: "today" },
    day: day(),
    state: viewed,
    name: "Марія",
    mapUrl: "https://nmt.in.ua/marathon/math-5/map",
  });
  const task = result.messages.find((message) => message.text.includes("2+2"));
  assert.equal(task?.buttons?.[0]?.text, "А. 3");
  assert.equal(task?.buttons?.some((button) => button.text === "Пройти тестування"), false);
  assert.equal(task?.buttons?.at(-1)?.data, "m:home");
  const finished = presentMarathon({
    callback: { kind: "today" },
    day: day(),
    state: { ...viewed, completed: true, answers: { 15: 2, 16: 1 }, score: 100, passed: true },
    name: "Марія",
    mapUrl: "https://nmt.in.ua/marathon/math-5/map",
  });
  const labels = finished.messages.flatMap((message) => message.buttons ?? []).map((button) => button.text);
  assert.equal(labels.includes("🏠 Головне меню"), true);
  assert.equal(labels.includes("Пройти тестування"), false);
  assert.equal(blob(finished.messages).includes(EXPLANATION), false);
  assert.match(blob(finished.messages), /вже зданий/);
});

test("materials are one message and an empty set opens the task", () => {
  const materials = presentMarathon({
    callback: { kind: "today" },
    day: day(),
    state: blankPlay(),
    name: "Марія",
    mapUrl: "https://nmt.in.ua/marathon/math-5/map",
  });
  assert.equal(materials.messages.length, 1);
  assert.match(materials.messages[0]!.text, /Прочитайте правило додавання/);
  assert.equal(materials.messages[0]!.buttons?.some((button) => button.data === "mh:mat:1"), true);
  assert.equal(materials.messages.some((message) => message.text.trim() === ""), false);

  const empty = presentMarathon({
    callback: { kind: "today" },
    day: day({ materials: [], introText: "  " }),
    state: blankPlay(),
    name: "Марія",
    mapUrl: "https://nmt.in.ua/marathon/math-5/map",
  });
  assert.equal(empty.state.materialsViewed, true);
  assert.match(blob(empty.messages), /2\+2/);
  assert.equal(empty.messages.some((message) => message.text.trim() === ""), false);

  const photo = presentMarathon({
    callback: { kind: "today" },
    day: day({ imageUrl: "https://nmt.in.ua/api/marathon-media/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
    state: blankPlay(),
    name: "Марія",
    mapUrl: "https://nmt.in.ua/marathon/math-5/map",
  });
  assert.equal(photo.messages[0]?.photoUrl, "https://nmt.in.ua/api/marathon-media/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.match(photo.messages[0]?.text ?? "", /Прочитайте правило/);
  assert.equal(photo.state.materialsViewed, false);

  const onlyPhoto = presentMarathon({
    callback: { kind: "today" },
    day: day({ materials: [], introText: "", imageUrl: "https://nmt.in.ua/pic.png" }),
    state: blankPlay(),
    name: "Марія",
    mapUrl: "https://nmt.in.ua/marathon/math-5/map",
  });
  assert.equal(onlyPhoto.messages[0]?.photoUrl, "https://nmt.in.ua/pic.png");
  assert.equal(onlyPhoto.state.materialsViewed, false);
  assert.equal(onlyPhoto.messages.some((message) => /2\+2/.test(message.text)), false);
});

test("finishing a day sends the review once, in a single message", () => {
  const opened = applyPlay(blankPlay(), { type: "materials" }, tasks, 60);
  const first = applyPlay(opened.state, { type: "answer", taskId: 15, option: 2 }, tasks, 60);
  const last = presentMarathon({
    callback: { kind: "answer", day: 1, taskId: 16, option: 1 },
    day: day(),
    state: first.state,
    name: "Марія",
    mapUrl: "https://nmt.in.ua/marathon/math-5/map",
  });
  assert.equal(last.completedNow, true);
  assert.equal(last.messages.length, 1);
  assert.match(blob(last.messages), new RegExp(EXPLANATION));
  assert.match(blob(last.messages), /Дроби/);
});
