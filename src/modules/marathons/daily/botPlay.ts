import { materialSources, optionLabel } from "./telegramContent";
import { isDayPassed, scorePercent } from "./score";
import {
  COPY_DEFAULTS,
  renderResolved,
  resolveCopy,
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
  | { kind: "today" }
  | { kind: "stop" }
  | { kind: "channels" }
  | { kind: "channel"; channel: "site" | "telegram" }
  | { kind: "materials"; day: number }
  | { kind: "open"; day: number }
  | { kind: "answer"; day: number; taskId: number; option: number }
  | { kind: "token"; token: string };

export type Outgoing = {
  text: string;
  rich?: boolean;
  buttons?: Array<{ text: string; data?: string; url?: string }>;
  previewUrl?: string;
  videoUrl?: string;
  videoFileId?: string;
  photoUrl?: string;
  siteUrl?: string;
  siteLabel?: string;
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
  if (data === "mh:today") return { kind: "today" };
  if (data === "mh:stop") return { kind: "stop" };
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
  return { score, passed: isDayPassed(score, passThreshold) };
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

function buttonLabel(copy: Partial<Record<CopyKey, string>> | undefined, key: CopyKey): string {
  return resolveCopy(key, copy).slice(0, 64);
}

export function menuMessages(
  copy: Partial<Record<CopyKey, string>> | undefined,
  mapUrl: string,
): Outgoing[] {
  return [
    {
      text: resolveCopy("bot_menu", copy),
      buttons: [
        { text: buttonLabel(copy, "bot_btn_today"), data: "mh:today" },
        { text: buttonLabel(copy, "bot_btn_map"), url: mapUrl },
        { text: buttonLabel(copy, "bot_btn_channel"), data: "mh:ch" },
        { text: buttonLabel(copy, "bot_btn_stop"), data: "mh:stop" },
      ],
    },
  ];
}

function channelMessages(copy: Partial<Record<CopyKey, string>> | undefined): Outgoing[] {
  return [
    {
      text: resolveCopy("channel_prompt", copy),
      buttons: [
        { text: buttonLabel(copy, "bot_btn_site"), data: "mh:ch:s" },
        { text: buttonLabel(copy, "bot_btn_telegram"), data: "mh:ch:t" },
      ],
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
  tokenFor?: (action: { day: number; taskId: number; option: number }) => string,
): Outgoing {
  const lines = [
    task.prompt,
    ...task.options.map((option, index) => `${index + 1}. ${option}`),
  ];
  return {
    text: lines.join("\n"),
    rich: true,
    siteUrl: day.pageUrl,
    siteLabel: buttonLabel(copy, "bot_open_site"),
    buttons: task.options.map((option, index) => ({
      text: optionLabel(option, index),
      data: tokenFor
        ? tokenFor({ day: day.dayNumber, taskId: task.id, option: index + 1 })
        : `mh:a:${day.dayNumber}:${task.id}:${index + 1}`,
    })),
  };
}

function nextTask(day: DayPacket, state: PlayState): GradedTask | null {
  return day.tasks.find((task) => state.answers[task.id] == null) ?? null;
}

function reviewMessages(
  day: DayPacket,
  state: PlayState,
  copy: Partial<Record<CopyKey, string>> | undefined,
  name: string,
  withFollowUp: boolean,
): Outgoing[] {
  const messages: Outgoing[] = [
    { text: renderResolved("review_intro", copy, varsFor(day, name)), rich: true },
  ];
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
    messages.push({ text: lines.join("\n"), rich: true });
  }
  if (!withFollowUp) return messages;
  const follow = followUpText(day, copy, name);
  if (follow) messages.push({ text: follow });
  return messages;
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
): Outgoing[] {
  if (day.locked) {
    return [
      {
        text: renderResolved("bot_locked", copy, varsFor(day, name)),
        buttons: [{ text: buttonLabel(copy, "bot_open_site"), url: day.pageUrl }],
      },
    ];
  }
  if (state.completed) return reviewMessages(day, state, copy, name, announce);
  if (!state.materialsViewed) {
    const messages: Outgoing[] = [];
    if (day.introText?.trim()) messages.push({ text: day.introText.trim(), rich: true });
    for (const material of day.materials) messages.push(...materialSources(material));
    if (messages.length === 0) messages.push({ text: " " });
    messages.push({
      text: buttonLabel(copy, "bot_to_tasks"),
      buttons: [{ text: buttonLabel(copy, "bot_to_tasks"), data: `mh:mat:${day.dayNumber}` }],
    });
    return messages;
  }
  const task = nextTask(day, state);
  if (!task) return reviewMessages(day, state, copy, name, announce);
  return [taskMessage(day, task, copy, tokenFor)];
}

export function presentMarathon(input: {
  copy?: Partial<Record<CopyKey, string>>;
  callback: BotCallback;
  day: DayPacket | null;
  state: PlayState;
  name: string;
  mapUrl: string;
  tokenFor?: (action: { day: number; taskId: number; option: number }) => string;
}): { messages: Outgoing[]; state: PlayState; completedNow: boolean } {
  const copy = input.copy;
  if (input.callback.kind === "menu") {
    return { messages: menuMessages(copy, input.mapUrl), state: input.state, completedNow: false };
  }
  if (input.callback.kind === "channels") {
    return { messages: channelMessages(copy), state: input.state, completedNow: false };
  }
  if (input.callback.kind === "channel") {
    return {
      messages: [
        {
          text: input.callback.channel === "site"
            ? resolveCopy("bot_btn_site", copy)
            : resolveCopy("bot_btn_telegram", copy),
        },
        ...menuMessages(copy, input.mapUrl),
      ],
      state: input.state,
      completedNow: false,
    };
  }
  if (input.callback.kind === "stop") {
    return {
      messages: [{ text: resolveCopy("bot_btn_stop", copy) }, ...menuMessages(copy, input.mapUrl)],
      state: input.state,
      completedNow: false,
    };
  }
  const day = input.day;
  if (!day) {
    return {
      messages: [{ text: COPY_DEFAULTS.bot_start }],
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
    return {
      messages: currentStep(day, input.state, copy, input.name, false, input.tokenFor),
      state: input.state,
      completedNow: false,
    };
  }
  if (input.callback.kind === "materials") {
    if (input.callback.day !== day.dayNumber) {
      return { messages: currentStep(day, input.state, copy, input.name, false, input.tokenFor), state: input.state, completedNow: false };
    }
    const applied = applyPlay(input.state, { type: "materials" }, day.tasks, day.passThreshold);
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
      messages: currentStep(day, applied.state, copy, input.name, applied.completedNow, input.tokenFor),
      state: applied.state,
      completedNow: applied.completedNow,
    };
  }
  return { messages: menuMessages(copy, input.mapUrl), state: input.state, completedNow: false };
}

export function startText(copy: Partial<Record<CopyKey, string>> | undefined, linked: boolean, mapUrl: string): Outgoing[] {
  if (!linked) return [{ text: resolveCopy("bot_start", copy) }];
  return menuMessages(copy, mapUrl);
}

export function linkOkText(copy: Partial<Record<CopyKey, string>> | undefined): string {
  return resolveCopy("bot_link_ok", copy);
}
