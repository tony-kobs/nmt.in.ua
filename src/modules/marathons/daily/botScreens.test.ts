import assert from "node:assert/strict";
import test from "node:test";
import {
  blankPlay,
  channelScreen,
  linkOkText,
  marathonReplyKeyboard,
  markedChannelLabel,
  presentMarathon,
  startText,
  type BotCallback,
  type DayPacket,
  type Outgoing,
} from "./botPlay";
import { COPY_DEFAULTS, COPY_KEYS, COPY_PLACEHOLDERS, COPY_PREVIEW_SAMPLE, renderResolved } from "./copy";

const BRACES = /\{[A-Za-z0-9_]+\}/;

const tasks = [
  {
    id: 15,
    order: 1,
    prompt: "Скільки буде 2+2?",
    options: ["3", "4"],
    correct: 2,
    explanation: "Чотири.",
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

function poisonedCopy(): Partial<Record<(typeof COPY_KEYS)[number], string>> {
  const suffix = COPY_PLACEHOLDERS.map((key) => `{${key}}`).join(" ");
  return Object.fromEntries(COPY_KEYS.map((key) => [key, `${COPY_DEFAULTS[key]} ${suffix}`]));
}

function visibleText(messages: Outgoing[]): string[] {
  const rows: string[] = [];
  for (const message of messages) {
    rows.push(message.text);
    if (message.siteLabel) rows.push(message.siteLabel);
    for (const button of message.buttons ?? []) rows.push(button.text);
  }
  return rows;
}

function assertClean(rows: string[], label: string) {
  for (const row of rows) {
    assert.equal(BRACES.test(row), false, `${label}: ${row}`);
  }
}

test("every bot template renders sample data without placeholders", () => {
  for (const key of COPY_KEYS) {
    const rendered = renderResolved(key, undefined, COPY_PREVIEW_SAMPLE);
    assert.equal(BRACES.test(rendered), false, `${key}: ${rendered}`);
  }
});

test("channel screen fills the name and marks the enabled channel", () => {
  const shown = presentMarathon({
    callback: { kind: "channels" },
    day: null,
    state: blankPlay(),
    name: "Марія",
    mapUrl: "https://nmt.in.ua/marathon/math-5/map",
    channels: { site: false, telegram: true },
  });
  const message = shown.messages[0];
  assert.ok(message);
  assert.match(message.text, /Марія/);
  assert.equal(message.text.includes("{name}"), false);
  const labels = (message.buttons ?? []).map((button) => button.text);
  assert.ok(labels.includes("✓ В Telegram"));
  assert.ok(labels.includes("На сайті"));
  assert.equal(labels.includes("✓ На сайті"), false);

  const both = channelScreen({ name: "Марія", site: true, telegram: true });
  const bothLabels = (both.buttons ?? []).map((button) => button.text);
  assert.ok(bothLabels.includes("✓ На сайті"));
  assert.ok(bothLabels.includes("✓ В Telegram"));

  const custom = channelScreen({
    copy: { channel_prompt: "{name}, курс «{title}»" },
    name: "Марія",
    site: false,
    telegram: false,
  });
  assert.equal(custom.text, "Марія, курс «»");
  assert.equal(BRACES.test(custom.text), false);
});

test("changing the channel confirms the checked label", () => {
  const changed = presentMarathon({
    callback: { kind: "channel", channel: "telegram" },
    day: null,
    state: blankPlay(),
    name: "Марія",
    mapUrl: "https://nmt.in.ua/marathon/math-5/map",
    channels: { site: true, telegram: true },
  });
  assert.equal(changed.messages[0]?.text, "✓ В Telegram");
  const labels = (changed.messages[0]?.buttons ?? []).map((button) => button.text);
  assert.ok(labels.includes("✓ В Telegram"));
  assert.ok(labels.includes("✓ На сайті"));
  assertClean(visibleText(changed.messages), "channel change");

  const site = presentMarathon({
    callback: { kind: "channel", channel: "site" },
    day: null,
    state: blankPlay(),
    name: "Марія",
    mapUrl: "https://nmt.in.ua/marathon/math-5/map",
  });
  assert.equal(site.messages[0]?.text, "✓ На сайті");
});

test("the channel mark stays on a long button label", () => {
  const marked = markedChannelLabel("Я".repeat(80), true);
  assert.equal(marked.startsWith("✓ "), true);
  assert.equal(marked.length, 64);
  assert.equal(markedChannelLabel("На сайті", false), "На сайті");
});

test("bot screens drop placeholders from every template", () => {
  const copy = poisonedCopy();
  const mapUrl = "https://nmt.in.ua/marathon/math-5/map";
  const base = {
    copy,
    state: { ...blankPlay(), materialsViewed: true },
    name: "Марія",
    mapUrl,
    channels: { site: true, telegram: false },
  };
  const callbacks: BotCallback[] = [
    { kind: "menu" },
    { kind: "top" },
    { kind: "channels" },
    { kind: "channel", channel: "site" },
    { kind: "channel", channel: "telegram" },
    { kind: "stop" },
    { kind: "today" },
    { kind: "open", day: 1 },
    { kind: "materials", day: 1 },
    { kind: "answer", day: 1, taskId: 15, option: 2 },
    { kind: "list" },
    { kind: "map" },
    { kind: "overall" },
    { kind: "pauseYes" },
    { kind: "quiz" },
  ];
  for (const callback of callbacks) {
    const shown = presentMarathon({ ...base, callback, day: day() });
    assertClean(visibleText(shown.messages), callback.kind);
  }
  const locked = presentMarathon({
    ...base,
    callback: { kind: "today" },
    day: day({ locked: true }),
  });
  assertClean(visibleText(locked.messages), "locked");
  const absent = presentMarathon({ ...base, callback: { kind: "today" }, day: null });
  assertClean(visibleText(absent.messages), "no day");
  assert.match(absent.messages[0]?.text ?? "", /Марія/);
  const fresh = presentMarathon({
    ...base,
    callback: { kind: "materials", day: 1 },
    state: blankPlay(),
    day: day(),
  });
  assertClean(visibleText(fresh.messages), "materials");
  assertClean(visibleText(startText(copy, false, mapUrl, "Марія")), "start");
  assertClean(visibleText(startText(copy, true, mapUrl, "Марія")), "menu start");
  assert.equal(BRACES.test(linkOkText(copy, "Марія")), false);
  const keyboard = marathonReplyKeyboard(copy, { others: true });
  assertClean(keyboard.keyboard.flat().map((button) => button.text), "keyboard");
  const closedKeys = marathonReplyKeyboard(copy, { closed: true });
  assertClean(closedKeys.keyboard.flat().map((button) => button.text), "closed keyboard");
});
