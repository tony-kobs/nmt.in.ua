import "server-only";

import { randomBytes } from "node:crypto";
import { piecesToReplies } from "@/modules/telegram/deliver";
import { homeReplyKeyboard, relocateSectionNavigation } from "@/modules/telegram/replyKeyboard";
import type { ReplyKeyboardMarkup, TelegramReply } from "@/modules/telegram/taskInteraction";
import { getLinkedUserByTelegramId } from "@/modules/telegram/tasks";
import { mainMenuDataButton, NOT_LINKED_TEXT } from "@/modules/telegram/ui";
import { absoluteUrl } from "@/modules/mail/sendMail";
import { isQuizCallback, presentBotQuiz, quizDataFromText, quizSectionKeyboard } from "./botQuiz";
import {
  blankPlay,
  callbackFromTokenPayload,
  isQuizKeyboardText,
  linkOkText,
  marathonCallbackFromText,
  marathonReplyKeyboard,
  parseBotCallback,
  presentMarathon,
  startText,
  type BotCallback,
  type DayPacket,
  type Outgoing,
  type PlayState,
} from "./botPlay";
import { renderCopy, renderResolved, resolveCopy } from "./copy";
import { decideSlot, findSlotOverride } from "./messageTimeline";
import { loadOverridesSafe } from "./messageOverrides";
import { expandSources, introSources } from "./telegramContent";
import {
  currentDayNumber,
  dayUnlockAt,
  evaluateDayAccess,
  formatKyivWhen,
} from "./calendar";
import { notifyMarathonRegistration } from "./registrationDelivery";
import { marathonDayUrl } from "./mailCopy";
import {
  BOARD_TOP,
  formatBoardMessage,
  visibleBoard,
} from "./leaderboard";
import { sendCompletedDayFollowUp, sendRankNotice } from "./notificationsJob";
import {
  completeParticipantDay,
  findParticipantByChat,
  listDays,
  listMaterials,
  listProgress,
  listTaskReview,
  loadMarathonBoard,
  loadMarathonCopy,
  markIntroSeen,
  markMaterialsViewed,
  listChatMarathons,
  pauseMarathonNotifications,
  readMarathonBotToken,
  selectChatMarathon,
  saveMarathonBotTokens,
  savePartialAnswers,
  setNotifyToggles,
  type DailyMarathon,
  type DayProgress,
  type MarathonDay,
  type Participant,
} from "./store";

type PrivateUpdate = {
  chatId: string;
  text: string | null;
  data: string | null;
};

function readPrivate(update: unknown): PrivateUpdate | null {
  if (!update || typeof update !== "object") return null;
  const callback = (update as { callback_query?: {
    data?: unknown;
    from?: { id?: number };
    message?: { chat?: { id?: number; type?: string } };
  } }).callback_query;
  if (callback?.from && callback.message?.chat?.type === "private" &&
      callback.message.chat.id === callback.from.id &&
      Number.isSafeInteger(callback.from.id)) {
    return {
      chatId: String(callback.from.id),
      text: null,
      data: typeof callback.data === "string" ? callback.data : null,
    };
  }
  const message = (update as { message?: {
    text?: unknown;
    from?: { id?: number };
    chat?: { id?: number; type?: string };
  } }).message;
  if (!message?.from || !message.chat || message.chat.type !== "private" ||
      message.chat.id !== message.from.id || !Number.isSafeInteger(message.from.id) ||
      typeof message.text !== "string") return null;
  return { chatId: String(message.from.id), text: message.text, data: null };
}

export function marathonUpdateKind(update: unknown): "callback" | "menu" | "bare-start" | null {
  const parsed = readPrivate(update);
  if (!parsed) return null;
  if (parsed.data?.startsWith("mh:")) return "callback";
  if (parsed.text && /^\/menu(?:@\w+)?\s*$/.test(parsed.text)) return "menu";
  if (parsed.text && /^\/start(?:@\w+)?\s*$/.test(parsed.text)) return "bare-start";
  return null;
}

function toReplies(chatId: string, messages: Outgoing[]): TelegramReply[] {
  return piecesToReplies(chatId, expandSources(messages));
}

function sectionReplies(
  chatId: string,
  messages: Outgoing[],
  stable: ReplyKeyboardMarkup,
): TelegramReply[] {
  return relocateSectionNavigation(toReplies(chatId, messages), stable);
}

function pack(replies: TelegramReply[]): TelegramReply | null {
  const [first, ...rest] = replies;
  if (!first) return null;
  return rest.length > 0 ? { ...first, continuation: rest } : first;
}

function introFor(
  videoUrl: string,
  rules: string,
): Outgoing[] {
  return introSources(videoUrl, rules);
}

function todayNumber(marathon: DailyMarathon, now: Date): number {
  return currentDayNumber({
    now,
    startDate: marathon.startDate,
    unlockHour: marathon.unlockHour,
    daysCount: marathon.daysCount,
  }) ?? 1;
}

function playFrom(progress: DayProgress | undefined): PlayState {
  if (!progress) return blankPlay();
  return {
    materialsViewed: progress.materialsViewed,
    answers: progress.answers,
    completed: progress.completedAt != null,
    score: progress.score,
    passed: progress.passed,
  };
}

async function buildDay(
  marathon: DailyMarathon,
  dayNumber: number,
  progress: DayProgress | undefined,
  days: MarathonDay[],
  now: Date,
): Promise<DayPacket | null> {
  const day = days.find((item) => item.dayNumber === dayNumber);
  if (!day) return null;
  const access = evaluateDayAccess({
    now,
    startDate: marathon.startDate,
    unlockHour: marathon.unlockHour,
    daysCount: marathon.daysCount,
    dayNumber,
  });
  const materials = access.open ? await listMaterials(day.id) : [];
  const tasks = access.open
    ? (await listTaskReview(day.id, progress?.answers ?? {})).map((task) => ({
        id: task.id,
        order: task.order,
        prompt: task.prompt,
        options: task.options,
        correct: task.correct,
        explanation: task.explanation,
      }))
    : [];
  const nextDay = days.find((item) => item.dayNumber === dayNumber + 1);
  const nextUnlock = nextDay
    ? dayUnlockAt({
        startDate: marathon.startDate,
        unlockHour: marathon.unlockHour,
        dayNumber: nextDay.dayNumber,
      })
    : null;
  return {
    dayNumber,
    topic: day.topic,
    locked: !access.open,
    unlockLabel: access.unlockAt ? formatKyivWhen(access.unlockAt, "uk-UA") : "",
    pageUrl: marathonDayUrl(marathon.slug, dayNumber),
    materials: materials.map((material) => ({
      type: material.type,
      urlOrBody: material.urlOrBody,
    })),
    tasks,
    passThreshold: marathon.passThreshold,
    introText: day.introText,
    daysCount: marathon.daysCount,
    next: nextDay && nextUnlock
      ? {
          dayNumber: nextDay.dayNumber,
          topic: nextDay.topic,
          unlockLabel: formatKyivWhen(nextUnlock, "uk-UA"),
          url: marathonDayUrl(marathon.slug, nextDay.dayNumber),
        }
      : null,
    finalUrl: absoluteUrl(`/marathon/${encodeURIComponent(marathon.slug)}/final`),
  };
}

export function callbackFrom(update: PrivateUpdate): BotCallback | null {
  if (update.data) return parseBotCallback(update.data);
  if (update.text && /^\/menu(?:@\w+)?\s*$/.test(update.text)) return { kind: "menu" };
  if (update.text && /^\/(?:top|leaderboard)(?:@\w+)?\s*$/.test(update.text)) return { kind: "top" };
  if (update.text && /^\/start(?:@\w+)?\s*$/.test(update.text)) return { kind: "menu" };
  return null;
}

export async function marathonBareStart(chatId: string): Promise<TelegramReply | null> {
  const linked = await findParticipantByChat(chatId);
  const copy = linked ? await loadMarathonCopy(linked.marathon.id) : {};
  const mapUrl = linked
    ? absoluteUrl(`/marathon/${encodeURIComponent(linked.marathon.slug)}/map`)
    : absoluteUrl("/");
  const messages = startText(copy, Boolean(linked), mapUrl);
  if (!linked) return pack(toReplies(chatId, messages));
  if (linked && !linked.participant.introSeen) {
    const rules = renderResolved("intro_rules", copy, {
      name: linked.participant.displayName || "учаснику",
      link: mapUrl,
    });
    messages.unshift(...introFor(linked.marathon.introVideoUrl, rules));
    await markIntroSeen(linked.marathon.id, linked.participant.userId, new Date());
  }
  return pack(toReplies(chatId, messages));
}

export async function marathonWelcome(chatId: string): Promise<TelegramReply | null> {
  const linked = await findParticipantByChat(chatId);
  const copy = linked ? await loadMarathonCopy(linked.marathon.id) : {};
  const mapUrl = linked
    ? absoluteUrl(`/marathon/${encodeURIComponent(linked.marathon.slug)}/map`)
    : absoluteUrl("/");
  const messages: Outgoing[] = [{ text: linkOkText(copy) }];
  if (linked && !linked.participant.introSeen) {
    const rules = renderResolved("intro_rules", copy, {
      name: linked.participant.displayName || "учаснику",
      link: mapUrl,
    });
    messages.push(...introFor(linked.marathon.introVideoUrl, rules));
    await markIntroSeen(linked.marathon.id, linked.participant.userId, new Date());
  }
  if (linked) messages.push(...startText(copy, true, mapUrl));
  return pack(toReplies(chatId, messages));
}

export async function marathonLinkText(chatId: string): Promise<string> {
  const linked = await findParticipantByChat(chatId);
  const copy = linked ? await loadMarathonCopy(linked.marathon.id) : {};
  return linkOkText(copy);
}

export async function handleMarathonGateway(update: unknown): Promise<TelegramReply[] | null> {
  const parsed = readPrivate(update);
  if (!parsed) return null;
  let callback = callbackFrom(parsed);
  if (!callback && parsed.text && !parsed.text.startsWith("/")) {
    const quizData = isQuizKeyboardText(parsed.text) ? await quizDataFromText(parsed.text) : null;
    if (quizData === "site") {
      return sectionReplies(parsed.chatId, [{ text: absoluteUrl("/topic") }], quizSectionKeyboard());
    }
    if (quizData) callback = parseBotCallback(quizData);
    else {
      const linkedForText = await findParticipantByChat(parsed.chatId);
      if (!linkedForText) return null;
      const copyForText = await loadMarathonCopy(linkedForText.marathon.id);
      const data = marathonCallbackFromText(parsed.text, copyForText);
      if (data === "m:home") return null;
      if (data) callback = parseBotCallback(data);
      else {
        const rows = await listChatMarathons(parsed.chatId);
        const title = parsed.text.trim();
        const row = rows.find((item) => (item.title.trim().slice(0, 60) || `Марафон ${item.id}`) === title);
        if (!row) return null;
        callback = { kind: "pick", marathonId: row.id };
      }
    }
  }
  if (!callback) return null;
  if (isQuizCallback(callback)) {
    const owner = await getLinkedUserByTelegramId(parsed.chatId);
    if (owner.status !== "success") {
      return sectionReplies(parsed.chatId, [{
        text: owner.code === "databaseFailure"
          ? "Не вдалося відкрити тести. Спробуйте пізніше."
          : NOT_LINKED_TEXT,
        buttons: [mainMenuDataButton()],
      }], homeReplyKeyboard());
    }
    return sectionReplies(parsed.chatId, await presentBotQuiz(owner.user.userId, callback), quizSectionKeyboard());
  }
  let linked = await findParticipantByChat(parsed.chatId);
  if (!linked) {
    if (callback.kind === "menu" || callback.kind === "today" || callback.kind === "top" || callback.kind === "stop" || callback.kind === "pauseYes" || callback.kind === "list" || callback.kind === "map") {
      return sectionReplies(parsed.chatId, [{
        text: `Ви ще не в марафоні. На сайті можна долучитись до відкритого курсу.\n${absoluteUrl("/marathon")}`,
        buttons: [mainMenuDataButton()],
      }], homeReplyKeyboard());
    }
    const bare = await marathonBareStart(parsed.chatId);
    return bare ? [bare] : null;
  }
  if (callback.kind === "list") {
    const rows = await listChatMarathons(parsed.chatId);
    return sectionReplies(parsed.chatId, [{
      text: "Оберіть марафон",
      buttons: [
        ...rows.map((row) => ({
          text: row.title.trim().slice(0, 60) || `Марафон ${row.id}`,
          data: `mh:pick:${row.id}`,
        })),
        { text: "⬅️ Назад", data: "mh:menu" },
        mainMenuDataButton(),
      ],
    }], marathonReplyKeyboard(undefined));
  }
  if (callback.kind === "pick") {
    const selected = await selectChatMarathon(parsed.chatId, callback.marathonId);
    if (!selected) {
      return sectionReplies(parsed.chatId, [{ text: "Цей марафон не прив’язаний до чату.", buttons: [mainMenuDataButton()] }], marathonReplyKeyboard(undefined));
    }
    linked = await findParticipantByChat(parsed.chatId);
    if (!linked) return sectionReplies(parsed.chatId, [{ text: "Не вдалося відкрити марафон.", buttons: [mainMenuDataButton()] }], marathonReplyKeyboard(undefined));
    callback = { kind: "menu" };
  }
  const { marathon, participant } = linked;
  if (callback.kind === "map") {
    const copy = await loadMarathonCopy(marathon.id);
    const several = (await listChatMarathons(parsed.chatId)).length > 1;
    return sectionReplies(parsed.chatId, [{
      text: absoluteUrl(`/marathon/${encodeURIComponent(marathon.slug)}/map`),
    }], marathonReplyKeyboard(copy, { others: several }));
  }
  if (callback.kind === "token") {
    const payload = await readMarathonBotToken(callback.token, marathon.id, participant.userId);
    const resolved = payload ? callbackFromTokenPayload(payload) : null;
    if (!resolved || resolved.kind !== "answer") {
      return sectionReplies(parsed.chatId, [{
        text: "Кнопка застаріла. Відкрийте сьогоднішній день ще раз.",
        buttons: [mainMenuDataButton()],
      }], marathonReplyKeyboard(undefined));
    }
    callback = resolved;
  }
  if (callback.kind === "stop" || callback.kind === "pauseYes") {
    const pauseCopy = await loadMarathonCopy(marathon.id);
    const several = (await listChatMarathons(parsed.chatId)).length > 1;
    const keyboard = marathonReplyKeyboard(pauseCopy, { others: several });
    const vars = { title: marathon.title, name: participant.displayName || "учаснику" };
    if (callback.kind === "pauseYes") {
      await pauseMarathonNotifications(marathon.id, participant.userId);
      return sectionReplies(parsed.chatId, [{
        text: renderResolved("bot_pause_done", pauseCopy, vars),
      }], keyboard);
    }
    return sectionReplies(parsed.chatId, [{
      text: renderResolved("bot_pause_ask", pauseCopy, vars),
      buttons: [
        { text: resolveCopy("bot_pause_yes", pauseCopy).slice(0, 64), data: "mh:py" },
        { text: "Скасувати", data: "mh:pn" },
      ],
    }], keyboard);
  }
  if (callback.kind === "top") {
    const copy = await loadMarathonCopy(marathon.id);
    const board = await loadMarathonBoard(marathon.id);
    const view = visibleBoard(board, participant.userId, BOARD_TOP);
    const several = (await listChatMarathons(parsed.chatId)).length > 1;
    return sectionReplies(parsed.chatId, [{
      text: formatBoardMessage({
        title: resolveCopy("rank_board", copy),
        rows: view.top,
        self: view.self,
        selfOutside: view.selfOutside,
      }),
    }], marathonReplyKeyboard(copy, { others: several }));
  }
  if (callback.kind === "channel") {
    await setNotifyToggles(marathon.id, participant.userId, {
      notifyEmail: callback.channel === "site" ? true : participant.notifyEmail,
      notifyBot: callback.channel === "telegram" ? true : participant.notifyBot,
    });
    if (callback.channel === "telegram") {
      await notifyMarathonRegistration({
        marathonId: marathon.id,
        userId: participant.userId,
        event: "channel",
        channel: "telegram",
        chatId: participant.telegramChatId,
      });
    }
  }
  const now = new Date();
  const [days, progressRows, copy] = await Promise.all([
    listDays(marathon.id),
    listProgress(marathon.id, participant.userId),
    loadMarathonCopy(marathon.id),
  ]);
  const requested = callback.kind === "open" || callback.kind === "materials" || callback.kind === "answer"
    ? callback.day
    : todayNumber(marathon, now);
  const progress = progressRows.find((item) => item.dayNumber === requested);
  const day = await buildDay(marathon, requested, progress, days, now);
  const before = playFrom(progress);
  const minted: Array<{ token: string; payload: string }> = [];
  const presented = presentMarathon({
    copy,
    callback,
    day,
    state: before,
    name: participant.displayName || "учаснику",
    mapUrl: absoluteUrl(`/marathon/${encodeURIComponent(marathon.slug)}/map`),
    followUp: await botFollowUp(marathon.id, day, participant.displayName || "учаснику", callback, now),
    tokenFor: (action) => {
      const token = randomBytes(12).toString("base64url");
      minted.push({
        token,
        payload: JSON.stringify({
          kind: "answer",
          day: action.day,
          taskId: action.taskId,
          option: action.option,
        }),
      });
      return `mh:z:${token}`;
    },
  });
  if (minted.length > 0) {
    await saveMarathonBotTokens(minted.map((row) => ({
      token: row.token,
      marathonId: marathon.id,
      userId: participant.userId,
      payload: row.payload,
    })));
  }
  let outgoing = presented.messages;
  const several = (await listChatMarathons(parsed.chatId)).length > 1;
  if (!participant.introSeen) {
    const mapUrl = absoluteUrl(`/marathon/${encodeURIComponent(marathon.slug)}/map`);
    outgoing = [
      ...introFor(marathon.introVideoUrl, renderResolved("intro_rules", copy, {
        name: participant.displayName || "учаснику",
        day: day?.dayNumber,
        topic: day?.topic ?? marathon.title,
        link: mapUrl,
      })),
      ...outgoing,
    ];
    await markIntroSeen(marathon.id, participant.userId, now);
  }
  const rankNote = await persistPlay({
    marathon,
    participant,
    day,
    content: days.find((item) => item.dayNumber === requested) ?? null,
    before,
    after: presented.state,
    completedNow: presented.completedNow,
    progressRows,
    copy,
    now,
  });
  if (rankNote) outgoing = [...outgoing, { text: rankNote }];
  return sectionReplies(parsed.chatId, outgoing, marathonReplyKeyboard(copy, { others: several }));
}

/** Drops or replaces the sentence the bot attaches when the participant finishes a day. */
async function botFollowUp(
  marathonId: number,
  day: DayPacket | null,
  name: string,
  callback: BotCallback,
  now: Date,
): Promise<string | null | undefined> {
  if (!day || callback.kind !== "answer") return undefined;
  const slot = day.dayNumber >= day.daysCount
    ? { dayNumber: day.dayNumber, kind: "final" as const }
    : day.next
      ? { dayNumber: day.next.dayNumber, kind: "tomorrow" as const }
      : null;
  if (!slot) return undefined;
  const row = findSlotOverride(
    await loadOverridesSafe(marathonId),
    marathonId,
    slot.dayNumber,
    slot.kind,
    "telegram",
  );
  if (!row) return undefined;
  const decision = decideSlot(row, now);
  if (decision === "cancel" || decision === "wait") return null;
  const custom = row.body?.trim();
  if (!custom) return undefined;
  return renderCopy(custom, {
    name,
    day: slot.dayNumber,
    topic: slot.kind === "tomorrow" ? (day.next?.topic ?? day.topic) : day.topic,
    unlock_time: day.next?.unlockLabel ?? "",
    link: slot.kind === "final" ? day.finalUrl : (day.next?.url ?? day.pageUrl),
  });
}

async function persistPlay(input: {
  marathon: DailyMarathon;
  participant: Participant;
  day: DayPacket | null;
  content: MarathonDay | null;
  before: PlayState;
  after: PlayState;
  completedNow: boolean;
  progressRows: DayProgress[];
  copy: Awaited<ReturnType<typeof loadMarathonCopy>>;
  now: Date;
}): Promise<string | null> {
  if (!input.day || !input.content || input.day.locked) return null;
  if (input.completedNow) {
    const result = await completeParticipantDay({
      marathon: input.marathon,
      userId: input.participant.userId,
      day: input.content,
      answers: input.after.answers,
      materialsViewed: true,
      progress: input.progressRows.map((item) => ({
        dayNumber: item.dayNumber,
        passed: item.passed,
        completedAt: item.completedAt,
      })),
      now: input.now,
    });
    let rankNote: string | null = null;
    if (result.ok && result.fresh && result.rank) {
      try {
        rankNote = await sendRankNotice({
          marathonId: input.marathon.id,
          slug: input.marathon.slug,
          copy: input.copy,
          dayNumber: input.day.dayNumber,
          place: result.rank.place,
          prevPlace: result.rank.prevPlace,
          points: result.rank.points,
          skipTelegram: true,
          person: {
            userId: input.participant.userId,
            email: input.participant.email,
            displayName: input.participant.displayName,
            telegramChatId: input.participant.telegramChatId,
            notifyEmail: input.participant.notifyEmail,
            notifyBot: input.participant.notifyBot,
            channel: input.participant.channel,
            completedDayNumbers: [input.day.dayNumber],
          },
        });
      } catch (error) {
        console.error("marathon rank notice", error);
      }
    }
    if (result.ok && result.fresh) {
    try {
      await sendCompletedDayFollowUp({
        marathonId: input.marathon.id,
        slug: input.marathon.slug,
        title: input.marathon.title,
        startDate: input.marathon.startDate,
        unlockHour: input.marathon.unlockHour,
        daysCount: input.marathon.daysCount,
        completedDay: input.day.dayNumber,
        topics: { [input.day.dayNumber]: input.day.topic, ...(input.day.next ? { [input.day.next.dayNumber]: input.day.next.topic } : {}) },
        copy: input.copy,
        person: {
          userId: input.participant.userId,
          email: input.participant.email,
          displayName: input.participant.displayName,
          telegramChatId: input.participant.telegramChatId,
          notifyEmail: input.participant.notifyEmail,
          notifyBot: input.participant.notifyBot,
          channel: input.participant.channel,
          completedDayNumbers: [input.day.dayNumber],
        },
        skipTelegram: true,
      });
    } catch (error) {
      console.error("marathon bot follow-up", error);
    }
    }
    return rankNote;
  }
  if (!input.before.materialsViewed && input.after.materialsViewed) {
    await markMaterialsViewed({
      marathon: input.marathon,
      userId: input.participant.userId,
      day: input.content,
      now: input.now,
    });
  }
  if (JSON.stringify(input.before.answers) !== JSON.stringify(input.after.answers)) {
    await savePartialAnswers({
      marathonId: input.marathon.id,
      userId: input.participant.userId,
      dayId: input.content.id,
      answers: input.after.answers,
      now: input.now,
    });
  }
  return null;
}
