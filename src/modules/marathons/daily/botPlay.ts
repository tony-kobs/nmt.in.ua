import { composeRichText, composeTelegramTask } from "@/modules/telegram/taskRender";
import { ACCOUNT_MENU } from "@/modules/telegram/replyKeyboard";
import { MAIN_MENU_LABEL, MENU, mainMenuDataButton } from "@/modules/telegram/ui";
import { isDayPassed, scorePercent } from "./score";
import {
  renderResolved,
  TELEGRAM_BUTTON_LIMIT,
  type CopyKey,
  type CopyVars,
} from "./copy";

export type GradedTask = {
  id: number;
  order: number;
  prompt: string;
  options: string[];
  correct: number;
  explanation: string | null;
};

export type PlayState = {
  materialsViewed: boolean;
  answers: Record<number, number>;
  completed: boolean;
  score: number | null;
  passed: boolean;
};

export type BotMaterial = {
  type: "loom" | "youtube" | "text";
  urlOrBody: string;
};

export type DayPacket = {
  dayNumber: number;
  topic: string;
  locked: boolean;
  unlockLabel: string;
  pageUrl: string;
  materials: BotMaterial[];
  tasks: GradedTask[];
  passThreshold: number;
  introText: string | null;
  daysCount: number;
  next: { dayNumber: number; topic: string; unlockLabel: string; url: string } | null;
  finalUrl: string;
};

export type BotCallback =
  | { kind: "menu" }
  | { kind: "list" }
  | { kind: "pick"; marathonId: number }
  | { kind: "today" }
  | { kind: "top" }
  | { kind: "overall" }
  | { kind: "stop" }
  | { kind: "pauseYes" }
  | { kind: "channels" }
  | { kind: "channel"; channel: "site" | "telegram" }
  | { kind: "materials"; day: number }
  | { kind: "open"; day: number }
  | { kind: "answer"; day: number; taskId: number; option: number }
  | { kind: "token"; token: string }
  | { kind: "quiz" }
  | { kind: "quizPage"; page: number }
  | { kind: "quizTheme"; themeId: number }
  | { kind: "quizStart"; themeId: number; count: number }
  | { kind: "quizResume" }
  | { kind: "quizReview" }
  | { kind: "quizAnswer"; sessionId: number; mappingId: number; option: number; attempt: 1 | 2 }
  | { kind: "map" }
  | { kind: "surveyRate"; rating: 1 | 2 | 3 | 4 | 5 }
  | { kind: "surveyRecommend"; yes: boolean }
  | { kind: "surveySkip" };

export type Outgoing = {
  text: string;
  rich?: boolean;
  buttons?: Array<{ text: string; data?: string; url?: string }>;
  previewUrl?: string;
  videoUrl?: string;
  videoFileId?: string;
  photoUrl?: string;
  formulaTex?: string;
  formulaDisplay?: boolean;
  siteUrl?: string;
  siteLabel?: string;
  siteOnFail?: boolean;
};

export function blankPlay(): PlayState {
  return {
    materialsViewed: false,
    answers: {},
    completed: false,
    score: null,
    passed: false,
  };
}

export function splitTelegramMessages(text: string, limit = 4000): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  if (clean.length <= limit) return [clean];
  const chunks: string[] = [];
  let rest = clean;
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    const breakAt = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"));
    const cut = breakAt > limit * 0.4 ? breakAt : limit;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks.filter((chunk) => chunk.length > 0);
}

export function materialsToTelegramChunks(materials: BotMaterial[]): string[] {
  const blocks = materials.map((material) => {
    if (material.type === "text") return material.urlOrBody.trim();
    return material.urlOrBody.trim();
  });
  return splitTelegramMessages(blocks.filter(Boolean).join("\n\n"));
}

export function parseBotCallback(data: string): BotCallback | null {
  if (!data.startsWith("mh:") || data.length > 64) return null;
  if (data === "mh:menu") return { kind: "menu" };
  if (data === "mh:quiz") return { kind: "quiz" };
  if (data === "mh:qr") return { kind: "quizReview" };
  if (data === "mh:qc") return { kind: "quizResume" };
  const quizPage = /^mh:qp:(\d{1,2})$/.exec(data);
  if (quizPage?.[1]) return { kind: "quizPage", page: Number(quizPage[1]) };
  const quizTheme = /^mh:qt:(\d{1,6})$/.exec(data);
  if (quizTheme?.[1]) return { kind: "quizTheme", themeId: Number(quizTheme[1]) };
  const quizStart = /^mh:qn:(\d{1,6}):(\d{1,3})$/.exec(data);
  if (quizStart?.[1] && quizStart[2]) {
    return { kind: "quizStart", themeId: Number(quizStart[1]), count: Number(quizStart[2]) };
  }
  const quizAnswer = /^mh:q([ar]):(\d{1,10}):(\d{1,10}):([1-4])$/.exec(data);
  if (quizAnswer?.[2] && quizAnswer[3] && quizAnswer[4]) {
    return {
      kind: "quizAnswer",
      attempt: quizAnswer[1] === "r" ? 2 : 1,
      sessionId: Number(quizAnswer[2]),
      mappingId: Number(quizAnswer[3]),
      option: Number(quizAnswer[4]) as 1 | 2 | 3 | 4,
    };
  }
  if (data === "mh:list") return { kind: "list" };
  const pick = /^mh:pick:(\d{1,10})$/.exec(data);
  if (pick?.[1]) return { kind: "pick", marathonId: Number(pick[1]) };
  if (data === "mh:map") return { kind: "map" };
  if (data === "mh:today") return { kind: "today" };
  if (data === "mh:top") return { kind: "top" };
  if (data === "mh:all") return { kind: "overall" };
  if (data === "mh:stop") return { kind: "stop" };
  const surveyRate = /^mh:sv:([1-5])$/.exec(data);
  if (surveyRate?.[1]) return { kind: "surveyRate", rating: Number(surveyRate[1]) as 1 | 2 | 3 | 4 | 5 };
  if (data === "mh:sv:y") return { kind: "surveyRecommend", yes: true };
  if (data === "mh:sv:n") return { kind: "surveyRecommend", yes: false };
  if (data === "mh:sv:x") return { kind: "surveySkip" };
  if (data === "mh:py") return { kind: "pauseYes" };
  if (data === "mh:pn") return { kind: "menu" };
  if (data === "mh:ch") return { kind: "channels" };
  if (data === "mh:ch:s") return { kind: "channel", channel: "site" };
  if (data === "mh:ch:t") return { kind: "channel", channel: "telegram" };
  const materials = /^mh:mat:(\d{1,2})$/.exec(data);
  if (materials) return { kind: "materials", day: Number(materials[1]) };
  const open = /^mh:go:(\d{1,2})$/.exec(data);
  if (open) return { kind: "open", day: Number(open[1]) };
  const token = /^mh:z:([A-Za-z0-9_-]{8,40})$/.exec(data);
  if (token?.[1]) return { kind: "token", token: token[1] };
  const answer = /^mh:a:(\d{1,2}):(\d{1,10}):([1-9])$/.exec(data);
  if (!answer) return null;
  return {
    kind: "answer",
    day: Number(answer[1]),
    taskId: Number(answer[2]),
    option: Number(answer[3]),
  };
}

export function callbackFromTokenPayload(payload: string): BotCallback | null {
  try {
    const value = JSON.parse(payload) as {
      kind?: unknown;
      day?: unknown;
      taskId?: unknown;
      option?: unknown;
    };
    if (value.kind !== "answer") return null;
    if (!Number.isInteger(value.day) || !Number.isInteger(value.taskId) || !Number.isInteger(value.option)) {
      return null;
    }
    const day = value.day as number;
    const taskId = value.taskId as number;
    const option = value.option as number;
    if (day < 1 || day > 99 || taskId < 1 || option < 1 || option > 20) return null;
    return { kind: "answer", day, taskId, option };
  } catch {
    return null;
  }
}

export function isMarathonCallbackData(data: string | undefined): boolean {
  return typeof data === "string" && data.startsWith("mh:") && data.length <= 64;
}

function allAnswered(tasks: GradedTask[], answers: Record<number, number>): boolean {
  return tasks.length > 0 && tasks.every((task) => {
    const choice = answers[task.id];
    return Number.isInteger(choice) && choice >= 1 && choice <= task.options.length;
  });
}

function grade(
  tasks: GradedTask[],
  answers: Record<number, number>,
  passThreshold: number,
): { score: number; passed: boolean } {
  let correct = 0;
  for (const task of tasks) {
    if (answers[task.id] === task.correct) correct += 1;
  }
  const score = scorePercent(correct, tasks.length);
  return { score, passed: isDayPassed(score, passThreshold, tasks.length) };
}

export type PlayEvent =
  | { type: "materials" }
  | { type: "answer"; taskId: number; option: number }
  | { type: "submit"; answers: Record<number, number> };

/**
 * Single progress step. A finished day ignores further answers.
 * The same answer twice does not complete the day a second time.
 */
export function applyPlay(
  state: PlayState,
  event: PlayEvent,
  tasks: GradedTask[],
  passThreshold: number,
): { state: PlayState; completedNow: boolean } {
  if (state.completed) return { state, completedNow: false };
  if (event.type === "materials") {
    if (state.materialsViewed) return { state, completedNow: false };
    return { state: { ...state, materialsViewed: true }, completedNow: false };
  }
  if (event.type === "submit") {
    const answers = sanitizeAnswers(tasks, event.answers);
    if (!state.materialsViewed || !allAnswered(tasks, answers)) {
      return { state, completedNow: false };
    }
    const graded = grade(tasks, answers, passThreshold);
    return {
      completedNow: true,
      state: {
        materialsViewed: true,
        answers,
        completed: true,
        score: graded.score,
        passed: graded.passed,
      },
    };
  }
  const task = tasks.find((item) => item.id === event.taskId);
  if (!task) return { state, completedNow: false };
  if (event.option < 1 || event.option > task.options.length) {
    return { state, completedNow: false };
  }
  if (state.answers[task.id] === event.option) return { state, completedNow: false };
  const answers = { ...state.answers, [task.id]: event.option };
  const next: PlayState = { ...state, materialsViewed: true, answers };
  if (!allAnswered(tasks, answers)) return { state: next, completedNow: false };
  const graded = grade(tasks, answers, passThreshold);
  return {
    completedNow: true,
    state: { ...next, completed: true, score: graded.score, passed: graded.passed },
  };
}

function sanitizeAnswers(
  tasks: GradedTask[],
  raw: Record<number, number>,
): Record<number, number> {
  const answers: Record<number, number> = {};
  for (const task of tasks) {
    const choice = raw[task.id];
    if (Number.isInteger(choice) && choice >= 1 && choice <= task.options.length) {
      answers[task.id] = choice;
    }
  }
  return answers;
}

function buttonLabel(
  copy: Partial<Record<CopyKey, string>> | undefined,
  key: CopyKey,
  vars: CopyVars = {},
): string {
  return renderResolved(key, copy, vars).slice(0, TELEGRAM_BUTTON_LIMIT);
}

const CHANNEL_MARK = "✓ ";

export type ChannelMarks = { site: boolean; telegram: boolean };

export function markedChannelLabel(label: string, selected: boolean): string {
  if (!selected) return label.slice(0, TELEGRAM_BUTTON_LIMIT);
  const room = TELEGRAM_BUTTON_LIMIT - CHANNEL_MARK.length;
  return `${CHANNEL_MARK}${label.slice(0, Math.max(0, room))}`;
}

export function channelChoiceLabel(
  copy: Partial<Record<CopyKey, string>> | undefined,
  channel: "site" | "telegram",
  name: string,
  selected = true,
): string {
  const key = channel === "site" ? "bot_btn_site" : "bot_btn_telegram";
  return markedChannelLabel(buttonLabel(copy, key, { name }), selected);
}

export function channelScreen(input: {
  copy?: Partial<Record<CopyKey, string>>;
  name: string;
  site: boolean;
  telegram: boolean;
}): Outgoing {
  const vars = { name: input.name };
  return {
    text: renderResolved("channel_prompt", input.copy, vars),
    buttons: withMainMenu([
      { text: channelChoiceLabel(input.copy, "site", input.name, input.site), data: "mh:ch:s" },
      { text: channelChoiceLabel(input.copy, "telegram", input.name, input.telegram), data: "mh:ch:t" },
    ]),
  };
}

function withMainMenu(buttons?: Outgoing["buttons"]): NonNullable<Outgoing["buttons"]> {
  const home = mainMenuDataButton();
  const list = [...(buttons ?? [])];
  if (!list.some((button) => button.data === home.data)) list.push(home);
  return list;
}

export const MARATHON_OTHERS_LABEL = "Інші марафони";

/** Marathon navigation under the input. It replaces the cabinet section list. */
export function marathonReplyKeyboard(
  copy: Partial<Record<CopyKey, string>> | undefined,
  options?: { others?: boolean; closed?: boolean },
): {
  keyboard: { text: string }[][];
  resize_keyboard: true;
  is_persistent: true;
} {
  const rows: { text: string }[][] = [];
  if (options?.closed) {
    rows.push([
      { text: buttonLabel(copy, "bot_btn_top") },
      { text: buttonLabel(copy, "bot_btn_overall") },
    ]);
  } else {
    rows.push([{ text: buttonLabel(copy, "bot_btn_today") }, { text: buttonLabel(copy, "bot_btn_top") }]);
    rows.push([{ text: buttonLabel(copy, "bot_btn_overall") }]);
  }
  rows.push([{ text: buttonLabel(copy, "bot_btn_map") }]);
  rows.push([{ text: buttonLabel(copy, "bot_btn_channel") }]);
  if (options?.others) rows.push([{ text: MARATHON_OTHERS_LABEL }]);
  rows.push([{ text: ACCOUNT_MENU.help.text }]);
  rows.push([{ text: MAIN_MENU_LABEL }]);
  return { keyboard: rows, resize_keyboard: true, is_persistent: true };
}

const BUTTON_BINDINGS: Array<{ key: CopyKey; data: string }> = [
  { key: "bot_btn_today", data: "mh:today" },
  { key: "bot_btn_top", data: "mh:top" },
  { key: "bot_btn_overall", data: "mh:all" },
  { key: "bot_btn_map", data: "mh:map" },
  { key: "bot_btn_channel", data: "mh:ch" },
  { key: "bot_btn_stop", data: "mh:stop" },
  { key: "bot_btn_begin", data: "mh:today" },
];

/** Current label and the shipped default, so a renamed button still matches an old keyboard. */
export function marathonButtonSnapshots(
  copy: Partial<Record<CopyKey, string>> | undefined,
): Array<{ data: string; label: string }> {
  const seen = new Set<string>();
  const rows: Array<{ data: string; label: string }> = [];
  for (const binding of BUTTON_BINDINGS) {
    for (const label of [buttonLabel(copy, binding.key), buttonLabel(undefined, binding.key)]) {
      const key = `${binding.data}\n${label}`;
      if (!label || seen.has(key)) continue;
      seen.add(key);
      rows.push({ data: binding.data, label });
    }
  }
  return rows;
}

/** Label of a marathon bottom button → the same callback the inline button uses. */
export function marathonCallbackFromText(
  text: string,
  copy: Partial<Record<CopyKey, string>> | undefined,
): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed === MARATHON_OTHERS_LABEL) return "mh:list";
  if (trimmed === "⬅️ Назад") return "mh:menu";
  if (trimmed === MAIN_MENU_LABEL) return MENU.home;
  for (const binding of BUTTON_BINDINGS) {
    if (trimmed === buttonLabel(copy, binding.key) || trimmed === buttonLabel(undefined, binding.key)) {
      return binding.data;
    }
  }
  return null;
}

const QUIZ_KEYBOARD_LABELS = [
  "Продовжити",
  "Нова тема",
  "Ще тест",
  "Новий тест",
  "Розбір останнього тесту",
  "Розбір помилок",
  "На сайт",
  "До тем",
];

/** Reply-keyboard labels of the topic-test section, including theme and count rows. */
export function isQuizKeyboardText(text: string): boolean {
  const trimmed = text.trim();
  if (QUIZ_KEYBOARD_LABELS.includes(trimmed)) return true;
  if (/^← стор\. \d{1,2}$/.test(trimmed)) return true;
  if (/^стор\. \d{1,2} →$/.test(trimmed)) return true;
  if (/^\d{1,3} · \S/.test(trimmed)) return true;
  if (/\S · \d{1,4}$/.test(trimmed) && !/^\d{1,3} · /.test(trimmed)) return true;
  return false;
}

export function isDefaultMarathonMenuLabel(text: string): boolean {
  const data = marathonCallbackFromText(text, undefined);
  return data != null && data !== MENU.home;
}

export function menuMessages(
  copy: Partial<Record<CopyKey, string>> | undefined,
  mapUrl: string,
  name = "",
): Outgoing[] {
  return [
    {
      text: renderResolved("bot_menu", copy, { name }),
      buttons: withMainMenu([
        { text: buttonLabel(copy, "bot_btn_today"), data: "mh:today" },
        { text: buttonLabel(copy, "bot_btn_top"), data: "mh:top" },
        { text: buttonLabel(copy, "bot_btn_map"), url: mapUrl },
        { text: buttonLabel(copy, "bot_btn_channel"), data: "mh:ch" },
      ]),
    },
  ];
}

function varsFor(day: DayPacket, name: string, extra?: Partial<CopyVars>): CopyVars {
  return {
    name,
    day: day.dayNumber,
    topic: day.topic,
    unlock_time: day.unlockLabel,
    link: day.pageUrl,
    ...extra,
  };
}

function taskMessage(
  day: DayPacket,
  task: GradedTask,
  copy: Partial<Record<CopyKey, string>> | undefined,
  name: string,
  tokenFor?: (action: { day: number; taskId: number; option: number }) => string,
): Outgoing {
  return composeTelegramTask({
    prompt: task.prompt,
    options: task.options,
    optionData: task.options.map((_, index) => (
      tokenFor
        ? tokenFor({ day: day.dayNumber, taskId: task.id, option: index + 1 })
        : `mh:a:${day.dayNumber}:${task.id}:${index + 1}`
    )),
    trailingButtons: [mainMenuDataButton()],
    siteUrl: day.pageUrl,
    siteLabel: buttonLabel(copy, "bot_open_site", varsFor(day, name)),
  });
}

function nextTask(day: DayPacket, state: PlayState): GradedTask | null {
  return day.tasks.find((task) => state.answers[task.id] == null) ?? null;
}

function materialBody(day: DayPacket): string {
  const parts: string[] = [];
  const intro = day.introText?.trim();
  if (intro) parts.push(intro);
  for (const material of day.materials) {
    const body = material.urlOrBody.trim();
    if (body) parts.push(body);
  }
  return parts.join("\n\n");
}

function clipCard(text: string): string {
  const clean = text.trim();
  if (clean.length <= 3900) return clean;
  return `${clean.slice(0, 3850).trim()}\n…`;
}

/** One card when the day is just finished. Reopening the day does not send this again. */
function reviewCard(
  day: DayPacket,
  state: PlayState,
  copy: Partial<Record<CopyKey, string>> | undefined,
  name: string,
  followUp?: string | null,
): Outgoing[] {
  const blocks = [renderResolved("review_intro", copy, varsFor(day, name))];
  for (const [index, task] of day.tasks.entries()) {
    const choice = state.answers[task.id] ?? null;
    const right = choice === task.correct;
    const chosen = choice == null ? "—" : task.options[choice - 1] ?? "—";
    const correct = task.options[task.correct - 1] ?? "";
    const lines = [
      `${index + 1}. ${task.prompt}`,
      right ? "Правильно" : "Неправильно",
      `Ваш вибір: ${chosen}`,
      `Правильна відповідь: ${correct}`,
    ];
    if (task.explanation) lines.push(task.explanation);
    blocks.push(lines.join("\n"));
  }
  if (followUp !== null) {
    const follow = followUp === undefined ? followUpText(day, copy, name) : followUp;
    if (follow) blocks.push(follow);
  }
  return [composeRichText({
    text: clipCard(blocks.join("\n\n")),
    buttons: withMainMenu(),
    siteUrl: day.pageUrl,
    siteLabel: buttonLabel(copy, "bot_open_site", varsFor(day, name)),
  })];
}

function doneCard(
  day: DayPacket,
  copy: Partial<Record<CopyKey, string>> | undefined,
  name: string,
): Outgoing[] {
  return [{
    text: renderResolved("bot_day_done", copy, varsFor(day, name)),
    buttons: withMainMenu([{ text: buttonLabel(copy, "bot_open_site", varsFor(day, name)), url: day.pageUrl }]),
  }];
}

export function followUpText(
  day: DayPacket,
  copy: Partial<Record<CopyKey, string>> | undefined,
  name: string,
): string | null {
  if (day.dayNumber >= day.daysCount) {
    return renderResolved("notify_final", copy, {
      name,
      day: day.dayNumber,
      topic: day.topic,
      link: day.finalUrl,
    });
  }
  if (!day.next) return null;
  return renderResolved("notify_tomorrow", copy, {
    name,
    day: day.next.dayNumber,
    topic: day.next.topic,
    unlock_time: day.next.unlockLabel,
    link: day.next.url,
  });
}

function currentStep(
  day: DayPacket,
  state: PlayState,
  copy: Partial<Record<CopyKey, string>> | undefined,
  name: string,
  announce: boolean,
  tokenFor?: (action: { day: number; taskId: number; option: number }) => string,
  followUp?: string | null,
): Outgoing[] {
  if (day.locked) {
    return [
      {
        text: renderResolved("bot_locked", copy, varsFor(day, name)),
        buttons: withMainMenu([{ text: buttonLabel(copy, "bot_open_site", varsFor(day, name)), url: day.pageUrl }]),
      },
    ];
  }
  if (state.completed) {
    return announce ? reviewCard(day, state, copy, name, followUp) : doneCard(day, copy, name);
  }
  if (!state.materialsViewed && materialBody(day)) {
    return [{
      text: materialBody(day),
      rich: true,
      buttons: withMainMenu([{ text: buttonLabel(copy, "bot_to_tasks", varsFor(day, name)), data: `mh:mat:${day.dayNumber}` }]),
    }];
  }
  const task = nextTask(day, state);
  if (!task) return reviewCard(day, state, copy, name, announce ? followUp : null);
  return [taskMessage(day, task, copy, name, tokenFor)];
}

/** An empty materials step is already done: the next screen is the task, not a blank bubble. */
function openedMaterials(state: PlayState, day: DayPacket): PlayState {
  if (day.locked || state.materialsViewed || state.completed || materialBody(day)) return state;
  return applyPlay(state, { type: "materials" }, day.tasks, day.passThreshold).state;
}

export function presentMarathon(input: {
  copy?: Partial<Record<CopyKey, string>>;
  callback: BotCallback;
  day: DayPacket | null;
  state: PlayState;
  name: string;
  mapUrl: string;
  tokenFor?: (action: { day: number; taskId: number; option: number }) => string;
  /** Replaces the follow-up sentence. `null` omits it. Omit the field for the default text. */
  followUp?: string | null;
  /** Enabled delivery sides. Both can be on. */
  channels?: ChannelMarks;
}): { messages: Outgoing[]; state: PlayState; completedNow: boolean } {
  const copy = input.copy;
  if (input.callback.kind === "menu" || input.callback.kind === "top") {
    return { messages: menuMessages(copy, input.mapUrl, input.name), state: input.state, completedNow: false };
  }
  if (input.callback.kind === "channels") {
    const marks = input.channels ?? { site: false, telegram: false };
    return {
      messages: [channelScreen({ copy, name: input.name, site: marks.site, telegram: marks.telegram })],
      state: input.state,
      completedNow: false,
    };
  }
  if (input.callback.kind === "channel") {
    const marks = input.channels ?? {
      site: input.callback.channel === "site",
      telegram: input.callback.channel === "telegram",
    };
    const screen = channelScreen({ copy, name: input.name, site: marks.site, telegram: marks.telegram });
    return {
      messages: [
        {
          text: channelChoiceLabel(copy, input.callback.channel, input.name, true),
          buttons: screen.buttons,
        },
        ...menuMessages(copy, input.mapUrl, input.name),
      ],
      state: input.state,
      completedNow: false,
    };
  }
  if (input.callback.kind === "stop") {
    return {
      messages: [
        { text: renderResolved("bot_btn_stop", copy, { name: input.name }) },
        ...menuMessages(copy, input.mapUrl, input.name),
      ],
      state: input.state,
      completedNow: false,
    };
  }
  const day = input.day;
  if (!day) {
    return {
      messages: [{ text: renderResolved("bot_start", copy, { name: input.name }) }],
      state: input.state,
      completedNow: false,
    };
  }
  if (day.locked && (input.callback.kind === "today" || input.callback.kind === "open" || input.callback.kind === "materials" || input.callback.kind === "answer")) {
    return {
      messages: currentStep(day, input.state, copy, input.name, false, input.tokenFor),
      state: input.state,
      completedNow: false,
    };
  }
  if (input.callback.kind === "today" || input.callback.kind === "open") {
    const state = openedMaterials(input.state, day);
    return {
      messages: currentStep(day, state, copy, input.name, false, input.tokenFor),
      state,
      completedNow: false,
    };
  }
  if (input.callback.kind === "materials") {
    if (input.callback.day !== day.dayNumber) {
      const state = openedMaterials(input.state, day);
      return { messages: currentStep(day, state, copy, input.name, false, input.tokenFor), state, completedNow: false };
    }
    const applied = applyPlay(openedMaterials(input.state, day), { type: "materials" }, day.tasks, day.passThreshold);
    return {
      messages: currentStep(day, applied.state, copy, input.name, false, input.tokenFor),
      state: applied.state,
      completedNow: false,
    };
  }
  if (input.callback.kind === "answer") {
    if (input.callback.day !== day.dayNumber) {
      return { messages: currentStep(day, input.state, copy, input.name, false, input.tokenFor), state: input.state, completedNow: false };
    }
    const applied = applyPlay(
      input.state,
      { type: "answer", taskId: input.callback.taskId, option: input.callback.option },
      day.tasks,
      day.passThreshold,
    );
    return {
      messages: currentStep(
        day,
        applied.state,
        copy,
        input.name,
        applied.completedNow,
        input.tokenFor,
        input.followUp,
      ),
      state: applied.state,
      completedNow: applied.completedNow,
    };
  }
  return { messages: menuMessages(copy, input.mapUrl, input.name), state: input.state, completedNow: false };
}

export function startText(
  copy: Partial<Record<CopyKey, string>> | undefined,
  linked: boolean,
  mapUrl: string,
  name = "",
): Outgoing[] {
  if (!linked) return [{ text: renderResolved("bot_start", copy, { name }) }];
  return menuMessages(copy, mapUrl, name);
}

export function linkOkText(copy: Partial<Record<CopyKey, string>> | undefined, name = ""): string {
  return renderResolved("bot_link_ok", copy, { name });
}
