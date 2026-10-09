import "server-only";

import type { TelegramReply } from "@/modules/telegram/taskInteraction";
import { absoluteUrl } from "@/modules/mail/sendMail";
import {
  blankPlay,
  linkOkText,
  parseBotCallback,
  presentMarathon,
  startText,
  type BotCallback,
  type DayPacket,
  type Outgoing,
  type PlayState,
} from "./botPlay";
import {
  dayUnlockAt,
  evaluateDayAccess,
  formatKyivWhen,
  kyivDateIso,
} from "./calendar";
import { marathonDayUrl } from "./mailCopy";
import { sendCompletedDayFollowUp } from "./notificationsJob";
import {
  completeParticipantDay,
  findParticipantByChat,
  listDays,
  listMaterials,
  listProgress,
  listTaskReview,
  loadMarathonCopy,
  markMaterialsViewed,
  pauseMarathonNotifications,
  savePartialAnswers,
  setDeliveryChannel,
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
  const replies: TelegramReply[] = [];
  for (const message of messages) {
    const text = message.text.trim().slice(0, 4096);
    if (!text) continue;
    const buttons: { text: string; callback_data?: string; url?: string }[] = [];
    for (const button of message.buttons ?? []) {
      const label = button.text.trim().slice(0, 64);
      if (!label) continue;
      if (button.url) buttons.push({ text: label, url: button.url });
      else if (button.data && button.data.length <= 64) {
        buttons.push({ text: label, callback_data: button.data });
      }
    }
    replies.push({
      chatId,
      text,
      ...(buttons.length
        ? { replyMarkup: { inline_keyboard: buttons.map((button) => [button]) } }
        : {}),
    });
  }
  return replies;
}

function todayNumber(marathon: DailyMarathon, now: Date): number {
  for (let dayNumber = 1; dayNumber <= marathon.daysCount; dayNumber += 1) {
    const unlock = dayUnlockAt({
      startDate: marathon.startDate,
      unlockHour: marathon.unlockHour,
      dayNumber,
    });
    if (kyivDateIso(unlock) === kyivDateIso(now)) return dayNumber;
  }
  const last = dayUnlockAt({
    startDate: marathon.startDate,
    unlockHour: marathon.unlockHour,
    dayNumber: marathon.daysCount,
  });
  return now.getTime() >= last.getTime() ? marathon.daysCount : 1;
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

function callbackFrom(update: PrivateUpdate): BotCallback | null {
  if (update.data) return parseBotCallback(update.data);
  if (update.text && /^\/menu(?:@\w+)?\s*$/.test(update.text)) return { kind: "menu" };
  if (update.text && /^\/start(?:@\w+)?\s*$/.test(update.text)) return { kind: "menu" };
  return null;
}

export async function marathonBareStart(chatId: string): Promise<TelegramReply | null> {
  const linked = await findParticipantByChat(chatId);
  const copy = linked ? await loadMarathonCopy(linked.marathon.id) : {};
  const mapUrl = linked
    ? absoluteUrl(`/marathon/${encodeURIComponent(linked.marathon.slug)}/map`)
    : absoluteUrl("/");
  return toReplies(chatId, startText(copy, Boolean(linked), mapUrl))[0] ?? null;
}

export async function marathonLinkText(chatId: string): Promise<string> {
  const linked = await findParticipantByChat(chatId);
  const copy = linked ? await loadMarathonCopy(linked.marathon.id) : {};
  return linkOkText(copy);
}

export async function handleMarathonGateway(update: unknown): Promise<TelegramReply[] | null> {
  const parsed = readPrivate(update);
  if (!parsed) return null;
  const callback = callbackFrom(parsed);
  if (!callback) return null;
  const linked = await findParticipantByChat(parsed.chatId);
  if (!linked) {
    const bare = await marathonBareStart(parsed.chatId);
    return bare ? [bare] : null;
  }
  const { marathon, participant } = linked;
  if (callback.kind === "stop") {
    await pauseMarathonNotifications(marathon.id, participant.userId);
  }
  if (callback.kind === "channel") {
    await setDeliveryChannel(
      marathon.id,
      participant.userId,
      callback.channel,
      Boolean(participant.telegramChatId),
    );
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
  const presented = presentMarathon({
    copy,
    callback,
    day,
    state: before,
    name: participant.displayName || "учаснику",
    mapUrl: absoluteUrl(`/marathon/${encodeURIComponent(marathon.slug)}/map`),
  });
  await persistPlay({
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
  return toReplies(parsed.chatId, presented.messages);
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
}): Promise<void> {
  if (!input.day || !input.content || input.day.locked) return;
  if (input.completedNow) {
    await completeParticipantDay({
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
          completedDayNumbers: [input.day.dayNumber],
        },
        skipTelegram: true,
      });
    } catch (error) {
      console.error("marathon bot follow-up", error);
    }
    return;
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
}
