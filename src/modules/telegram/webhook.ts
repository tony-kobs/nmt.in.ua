import "server-only";

import { timingSafeEqual } from "node:crypto";
import { consumeTelegramLink } from "./link";
import { UNLINK_NOTICE, unlinkTelegramAccount } from "./unlink";
import { getTelegramTaskSessions, getTelegramTodayTaskSessions } from "./tasks";
import { completeTelegramTask } from "./completeTask";
import { handleTaskCallback, parseTaskCallback, type TelegramReply } from "./taskInteraction";
import { isDefaultMarathonMenuLabel, isMarathonCallbackData, isQuizKeyboardText } from "@/modules/marathons/daily/botPlay";
import { TELEGRAM_TAKEN_MESSAGE } from "@/modules/marathons/daily/botLink";
import { getTelegramTaskDetails } from "./taskDetails";
import { getTelegramAccountProfile } from "./account";
import { loadTelegramConnection } from "./schema";
import { buildTaskListReply } from "./taskList";
import { handleMenuRequest, parseMenuCallback, parseMenuCommand, parseMenuData, type MenuDeps } from "./menu";
import { accountCallbackFromText, attachReplyKeyboard, collapsedMenuKeyboard, expandedMenuKeyboard, MENU_CLOSE_LABEL, MENU_OPEN_LABEL, parsePrivateMenuText } from "./replyKeyboard";
import { readSurveyNote, type SurveyPrompt } from "@/modules/marathons/daily/survey";
import { dispatchTeamChat } from "@/modules/support/teamBroadcast";
import { intakeDecision, readPrivateNote, readSupportReplyPress } from "@/modules/support/text";

type TelegramMessage = {
  chat?: { id?: number; type?: string };
  from?: { id?: number; username?: string };
  text?: string;
};

export function verifyTelegramWebhookSecret(received: string | null, expected: string): boolean {
  if (!received || !expected) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

const UNLINK_TEXT = new Set(["Відв'язати", "Відв’язати", "Відв'язати Telegram", "Відв’язати Telegram"]);

/** `/stop` or the exact «Відв'язати» label in a private chat owned by the sender. */
export function parseTelegramUnlink(update: unknown): { chatId: string; userId: string } | null {
  if (typeof update !== "object" || update === null) return null;
  const message = (update as { message?: TelegramMessage }).message;
  if (!message?.chat || !message.from || message.chat.type !== "private" ||
      !Number.isSafeInteger(message.chat.id) || !Number.isSafeInteger(message.from.id) ||
      message.chat.id !== message.from.id || typeof message.text !== "string") return null;
  const text = message.text.trim();
  if (!/^\/stop(?:@\w+)?$/.test(text) && !UNLINK_TEXT.has(text)) return null;
  return { chatId: String(message.chat.id), userId: String(message.from.id) };
}

export function parseTelegramStart(update: unknown): {
  chatId: string;
  userId: string;
  username?: string;
  payload: string | null;
} | null {
  if (typeof update !== "object" || update === null) return null;
  const message = (update as { message?: TelegramMessage }).message;
  if (!message || !message.chat || !message.from || message.chat.type !== "private" ||
      !Number.isSafeInteger(message.chat.id) || !Number.isSafeInteger(message.from.id) ||
      message.chat.id !== message.from.id || typeof message.text !== "string") return null;
  const match = /^\/start(?:@\w+)?(?:\s+([^\s]+))?\s*$/.exec(message.text);
  if (!match) return null;
  return {
    chatId: String(message.chat.id),
    userId: String(message.from.id),
    username: message.from.username,
    payload: match[1] ?? null,
  };
}

export async function handleTelegramUpdate(
  update: unknown,
  deps: {
    consume: typeof consumeTelegramLink;
    getTasks?: typeof getTelegramTaskSessions;
    getTodayTasks?: typeof getTelegramTodayTaskSessions;
    logError?: (error: unknown) => void;
    completeTask?: typeof completeTelegramTask;
    referenceSecret?: string;
    getDetails?: typeof getTelegramTaskDetails;
    acknowledgeCallback?: (queryId: string) => Promise<void>;
    marathon?: (update: unknown) => Promise<TelegramReply | TelegramReply[] | null>;
    marathonBareStart?: (chatId: string) => Promise<TelegramReply | null>;
    marathonLinkText?: (chatId: string) => Promise<string>;
    marathonWelcome?: (chatId: string) => Promise<TelegramReply | null>;
    unlink?: (userId: number) => Promise<unknown>;
    consumeMarathon?: (
      token: string,
      identity: { userId: string; chatId: string; username?: string },
    ) => Promise<boolean | { ok: boolean; code?: string }>;
    getProfile?: typeof getTelegramAccountProfile;
    menu?: Omit<MenuDeps, "getProfile" | "getTasks" | "getTodayTasks" | "referenceSecret" | "logError">;
    survey?: {
      takeText?: (chatId: string, body: string) => Promise<SurveyPrompt | null>;
    };
    support?: {
      peek?: (chatId: string) => Promise<boolean>;
      peekFollow?: (chatId: string) => Promise<boolean>;
      cancel?: (chatId: string) => Promise<void>;
      cancelFollow?: (chatId: string) => Promise<void>;
      accept?: (input: { chatId: string; body: string; kind?: "text" | "photo" }) => Promise<{ text: string } | null>;
      acceptFollowup?: (input: {
        chatId: string;
        body: string;
        kind: "text" | "photo";
        replyToMessageId: number | null;
      }) => Promise<{ text: string } | null>;
      armFollowup?: (chatId: string, ticketId: number) => Promise<{ text: string } | null>;
    };
    teamChat?: (update: unknown) => Promise<{ handled: boolean; reply: TelegramReply | null }>;
  } = { consume: consumeTelegramLink },
): Promise<TelegramReply | null> {
  const team = deps.teamChat
    ? await deps.teamChat(update)
    : await dispatchTeamChat(update, deps.acknowledgeCallback);
  if (team.handled) return team.reply;
  const menuDeps: MenuDeps = {
    ...deps.menu,
    getProfile: deps.getProfile,
    getTasks: deps.getTasks,
    getTodayTasks: deps.getTodayTasks,
    referenceSecret: deps.referenceSecret,
    logError: deps.logError,
  };
  const log = deps.logError ?? ((value: unknown) => console.error("telegram update failed", value));
  const unlinkRequest = parseTelegramUnlink(update);
  if (unlinkRequest) {
    try {
      const profile = await (deps.getProfile ?? getTelegramAccountProfile)(unlinkRequest.userId, {
        getConnection: menuDeps.getConnection ?? loadTelegramConnection,
        logError: deps.logError,
      });
      if (profile.status !== "success") {
        return { chatId: unlinkRequest.chatId, text: "Telegram уже не прив’язано до акаунта nmt.in.ua." };
      }
      await (deps.unlink ?? unlinkTelegramAccount)(profile.profile.userId);
      await cancelSupportWait(unlinkRequest.chatId, deps);
      return { chatId: unlinkRequest.chatId, text: UNLINK_NOTICE };
    } catch (error) {
      log(error);
      return { chatId: unlinkRequest.chatId, text: "Не вдалося відв’язати бота. Спробуйте в кабінеті на nmt.in.ua." };
    }
  }
  const supportCaptured = await captureSupport(update, deps, log);
  if (supportCaptured) {
    await acknowledgeQuietly(deps, callbackQueryId(update));
    return supportCaptured;
  }
  const captured = await captureSurvey(update, deps, log);
  if (captured) return captured;
  async function accountKeyboard(userId: string) {
    try {
      const profile = await (deps.getProfile ?? getTelegramAccountProfile)(userId, {
        getConnection: menuDeps.getConnection ?? loadTelegramConnection,
        logError: deps.logError,
      });
      if (profile.status !== "success") return undefined;
      return collapsedMenuKeyboard();
    } catch (error) {
      log(error);
      return undefined;
    }
  }
  async function runMarathon(source: unknown): Promise<TelegramReply | null> {
    try {
      const handler = deps.marathon ?? (await import("@/modules/marathons/daily/botGateway")).handleMarathonGateway;
      return packReplies(await handler(source));
    } catch (error) {
      log(error);
      const chatId = callbackChatId(source) ?? messageChatId(source);
      return chatId ? { chatId, text: "Не вдалося обробити дію. Спробуйте пізніше." } : null;
    }
  }
  async function replyToMenuText(source: unknown): Promise<TelegramReply | null> {
    const menuText = parsePrivateMenuText(source);
    if (!menuText) return null;
    const data = accountCallbackFromText(menuText.text);
    if (menuText.text === MENU_OPEN_LABEL || menuText.text === MENU_CLOSE_LABEL) {
      if (menuText.text === MENU_CLOSE_LABEL) {
        return { chatId: menuText.chatId, text: "Меню згорнуто.", replyKeyboard: collapsedMenuKeyboard() };
      }
      try {
        const profile = await (deps.getProfile ?? getTelegramAccountProfile)(menuText.userId, {
          getConnection: menuDeps.getConnection ?? loadTelegramConnection,
          logError: deps.logError,
        });
        const role = profile.status === "success" && profile.profile.role === "teacher" ? "teacher" : "student";
        return {
          chatId: menuText.chatId,
          text: "Оберіть розділ.",
          replyKeyboard: expandedMenuKeyboard(role),
        };
      } catch (error) {
        log(error);
        return { chatId: menuText.chatId, text: "Не вдалося відкрити меню. Спробуйте пізніше.", replyKeyboard: collapsedMenuKeyboard() };
      }
    }
    if (data) {
      if (data.startsWith("mh:")) {
        const id = Number(menuText.chatId);
        return runMarathon({
          callback_query: {
            id: "reply-keyboard",
            data,
            from: { id },
            message: { message_id: 1, chat: { id, type: "private" } },
          },
        });
      }
      try {
        return await handleMenuRequest({
          chatId: menuText.chatId,
          userId: menuText.userId,
          action: parseMenuData(data),
        }, menuDeps);
      } catch (error) {
        log(error);
        return { chatId: menuText.chatId, text: "Не вдалося обробити дію. Спробуйте пізніше." };
      }
    }
    if (!deps.marathon && !isDefaultMarathonMenuLabel(menuText.text) && !isQuizKeyboardText(menuText.text)) return null;
    return runMarathon(source);
  }
  const callbackData = callbackDataOf(update);
  const entry = parseMenuCommand(update);
  if (entry && entry.action.kind === "screen" && entry.action.screen === "home" && !isMarathonCallbackData(callbackData)) {
    try {
      const profile = await (deps.getProfile ?? getTelegramAccountProfile)(entry.userId, {
        getConnection: menuDeps.getConnection ?? loadTelegramConnection, logError: deps.logError,
      });
      if (profile.status === "success") {
        return handleMenuRequest(entry, { ...menuDeps, getProfile: async () => profile });
      }
    } catch (error) {
      (deps.logError ?? ((value) => console.error("telegram menu entry failed", value)))(error);
    }
  }
  if (isMarathonCallbackData(callbackData) || isMarathonMenu(update)) {
    await acknowledgeQuietly(deps, callbackQueryId(update));
    try {
      const handler = deps.marathon ?? (await import("@/modules/marathons/daily/botGateway")).handleMarathonGateway;
      return packReplies(await handler(update));
    } catch (error) {
      (deps.logError ?? ((value) => console.error("marathon telegram failed", value)))(error);
      const chatId = callbackChatId(update) ?? messageChatId(update);
      return chatId ? { chatId, text: "Не вдалося обробити дію. Спробуйте пізніше." } : null;
    }
  }
  const menuCallback = parseMenuCallback(update);
  if (menuCallback) {
    await acknowledgeQuietly(deps, menuCallback.queryId);
    try {
      return await handleMenuRequest(menuCallback, menuDeps);
    } catch (error) {
      (deps.logError ?? ((value) => console.error("telegram menu callback failed", value)))(error);
      return { chatId: menuCallback.chatId, text: "Не вдалося обробити дію. Спробуйте пізніше." };
    }
  }
  const callback = parseTaskCallback(update);
  if (callback) {
    await acknowledgeQuietly(deps, callback.queryId);
    try {
      return await handleTaskCallback(callback, {
        secret: deps.referenceSecret ?? process.env.TELEGRAM_WEBHOOK_SECRET ?? "",
        getDetails: deps.getDetails, completeTask: deps.completeTask,
      });
    } catch (error) {
      (deps.logError ?? ((value) => console.error("telegram callback failed", value)))(error);
      return { chatId: callback.chatId, text: "Не вдалося обробити дію. Спробуйте пізніше." };
    }
  }
  const done = parseTelegramDoneCommand(update);
  if (done) {
    if (!done.reference) return { chatId: done.chatId, text: "Використайте /done <посилання> зі списку /tasks або /today." };
    try {
      const result = await (deps.completeTask ?? completeTelegramTask)(done.userId, done.reference);
      return { chatId: done.chatId, text: result.status === "success" ? "Завдання завершено."
        : result.code === "notLinked" ? "Спочатку підключіть Telegram у своєму кабінеті на nmt.in.ua."
        : result.code === "databaseFailure" ? "Не вдалося завершити завдання. Спробуйте пізніше."
        : "Це завдання не можна завершити. Перевірте його стан і відповіді в кабінеті." };
    } catch (error) {
      (deps.logError ?? ((value) => console.error("telegram completion failed", value)))(error);
      return { chatId: done.chatId, text: "Не вдалося завершити завдання. Спробуйте пізніше." };
    }
  }
  const command = parseTelegramTaskCommand(update);
  if (command?.today) {
    try {
      return await handleMenuRequest({
        chatId: command.chatId,
        userId: command.userId,
        action: { kind: "screen", screen: "today" },
      }, menuDeps);
    } catch (error) {
      log(error);
      return { chatId: command.chatId, text: "Не вдалося відкрити сьогодні. Спробуйте пізніше." };
    }
  }
  if (command) {
    return buildTaskListReply({ chatId: command.chatId, userId: command.userId, today: false }, deps);
  }
  const menuCommand = parseMenuCommand(update);
  if (menuCommand && !(menuCommand.action.kind === "screen" && menuCommand.action.screen === "home")) {
    try {
      return await handleMenuRequest(menuCommand, menuDeps);
    } catch (error) {
      (deps.logError ?? ((value) => console.error("telegram menu command failed", value)))(error);
      return { chatId: menuCommand.chatId, text: "Не вдалося обробити команду. Спробуйте пізніше." };
    }
  }
  const start = parseTelegramStart(update);
  if (!start) return replyToMenuText(update);
  if (start.payload && start.payload.startsWith("mth_") && start.payload.length !== 43) {
    try {
      const consumeMarathon = deps.consumeMarathon
        ?? (await import("@/modules/marathons/daily/botLink")).consumeMarathonStart;
      const linked = await consumeMarathon(start.payload, {
        userId: start.userId,
        chatId: start.chatId,
        username: start.username,
      });
      const accepted = linked === true || (typeof linked === "object" && linked?.ok === true);
      const taken = typeof linked === "object" && linked?.ok === false && linked.code === "telegram_taken";
      if (accepted && deps.marathonWelcome) {
        const welcome = await deps.marathonWelcome(start.chatId);
        if (welcome) {
          const keyboard = await accountKeyboard(start.userId);
          return keyboard ? attachReplyKeyboard(welcome, keyboard) : welcome;
        }
      }
      const linkedText = accepted && deps.marathonLinkText
        ? await deps.marathonLinkText(start.chatId)
        : null;
      const keyboard = accepted ? await accountKeyboard(start.userId) : undefined;
      return {
        chatId: start.chatId,
        text: taken
          ? TELEGRAM_TAKEN_MESSAGE
          : accepted
            ? linkedText || "Бот марафону підключено. Нагадування про дні приходитимуть сюди."
            : "Код марафону недійсний або його термін минув. Створіть новий у кабінеті марафону.",
        ...(keyboard ? { replyKeyboard: keyboard } : {}),
      };
    } catch (error) {
      (deps.logError ?? ((value) => console.error("marathon telegram link failed", value)))(error);
      return { chatId: start.chatId, text: "Не вдалося підключити бота. Спробуйте пізніше." };
    }
  }
  if (!start.payload) {
    if (deps.marathonBareStart) {
      try {
        const menu = await deps.marathonBareStart(start.chatId);
        if (menu) return menu;
      } catch (error) {
        (deps.logError ?? ((value) => console.error("marathon start failed", value)))(error);
      }
    }
    return { chatId: start.chatId, text: "Щоб підключити Telegram, почніть у своєму кабінеті на nmt.in.ua." };
  }
  const linked = await deps.consume(start.payload, {
    userId: start.userId,
    chatId: start.chatId,
    username: start.username,
  });
  if (!linked) {
    return { chatId: start.chatId, text: "Посилання недійсне або термін його дії минув. Створіть нове у своєму кабінеті." };
  }
  const keyboard = await accountKeyboard(start.userId);
  return {
    chatId: start.chatId,
    text: "✅ Telegram успішно підключено до вашого облікового запису.",
    ...(keyboard ? { replyKeyboard: keyboard } : {}),
  };
}

export function parseTelegramDoneCommand(update: unknown): { chatId: string; userId: string; reference: string | null } | null {
  if (typeof update !== "object" || update === null) return null;
  const message = (update as { message?: TelegramMessage }).message;
  if (!message?.chat || !message.from || message.chat.type !== "private" ||
      !Number.isSafeInteger(message.from.id) || Number(message.from.id) <= 0 ||
      message.chat.id !== message.from.id || typeof message.text !== "string") return null;
  if (!/^\/done(?:@\w+)?(?:\s|$)/.test(message.text)) return null;
  const match = /^\/done(?:@\w+)?\s+([A-Za-z0-9_-]{39,59})\s*$/.exec(message.text);
  return { chatId: String(message.chat.id), userId: String(message.from.id), reference: match?.[1] ?? null };
}

export function parseTelegramTaskCommand(update: unknown): {
  chatId: string; userId: string; today: boolean;
} | null {
  if (typeof update !== "object" || update === null) return null;
  const message = (update as { message?: TelegramMessage }).message;
  if (!message || !message.chat || !message.from || message.chat.type !== "private" ||
      !Number.isSafeInteger(message.chat.id) || !Number.isSafeInteger(message.from.id) ||
      Number(message.from.id) <= 0 || message.chat.id !== message.from.id || typeof message.text !== "string") return null;
  const match = /^\/(tasks|today)(?:@\w+)?\s*$/.exec(message.text);
  return match ? { chatId: String(message.chat.id), userId: String(message.from.id), today: match[1] === "today" } : null;
}

function packReplies(reply: TelegramReply | TelegramReply[] | null): TelegramReply | null {
  if (!reply) return null;
  const list = Array.isArray(reply) ? reply : [reply];
  const [first, ...rest] = list;
  if (!first) return null;
  return rest.length > 0 ? { ...first, continuation: rest } : first;
}

function callbackDataOf(update: unknown): string | undefined {
  if (!update || typeof update !== "object") return undefined;
  const data = (update as { callback_query?: { data?: unknown } }).callback_query?.data;
  return typeof data === "string" ? data : undefined;
}

async function acknowledgeQuietly(
  deps: { acknowledgeCallback?: (queryId: string) => Promise<void>; logError?: (error: unknown) => void },
  queryId: string | null | undefined,
): Promise<void> {
  if (!queryId || !deps.acknowledgeCallback) return;
  try {
    await deps.acknowledgeCallback(queryId);
  } catch (error) {
    (deps.logError ?? ((value) => console.error("telegram callback acknowledgement failed", value)))(error);
  }
}

function callbackQueryId(update: unknown): string | null {
  if (!update || typeof update !== "object") return null;
  const id = (update as { callback_query?: { id?: unknown } }).callback_query?.id;
  return typeof id === "string" ? id : null;
}

function callbackChatId(update: unknown): string | null {
  if (!update || typeof update !== "object") return null;
  const id = (update as { callback_query?: { from?: { id?: number } } }).callback_query?.from?.id;
  return Number.isSafeInteger(id) ? String(id) : null;
}

function messageChatId(update: unknown): string | null {
  if (!update || typeof update !== "object") return null;
  const id = (update as { message?: { chat?: { id?: number } } }).message?.chat?.id;
  return Number.isSafeInteger(id) ? String(id) : null;
}

function isMarathonMenu(update: unknown): boolean {
  if (!update || typeof update !== "object") return false;
  const text = (update as { message?: { text?: unknown } }).message?.text;
  return typeof text === "string" && /^\/(menu|top|leaderboard)(?:@\w+)?\s*$/.test(text);
}

async function cancelSupportWait(
  chatId: string,
  deps: {
    support?: { cancel?: (chatId: string) => Promise<void> };
  },
): Promise<void> {
  if (deps.support?.cancel) {
    await deps.support.cancel(chatId);
    return;
  }
  if (!process.env.DB_HOST) return;
  const { cancelSupportWait: cancel } = await import("@/modules/support/store");
  await cancel(chatId);
}

async function captureSupport(
  update: unknown,
  deps: {
    support?: {
      peek?: (chatId: string) => Promise<boolean>;
      peekFollow?: (chatId: string) => Promise<boolean>;
      cancel?: (chatId: string) => Promise<void>;
      cancelFollow?: (chatId: string) => Promise<void>;
      accept?: (input: { chatId: string; body: string; kind?: "text" | "photo" }) => Promise<{ text: string } | null>;
      acceptFollowup?: (input: {
        chatId: string;
        body: string;
        kind: "text" | "photo";
        replyToMessageId: number | null;
      }) => Promise<{ text: string } | null>;
      armFollowup?: (chatId: string, ticketId: number) => Promise<{ text: string } | null>;
    };
  },
  log: (error: unknown) => void,
): Promise<TelegramReply | null> {
  const press = readSupportReplyPress(update);
  const note = press ? null : readPrivateNote(update);
  if (!press && !note) return null;
  try {
    const injected = Boolean(deps.support?.peek && deps.support.cancel && deps.support.accept);
    const store = injected ? null : await import("@/modules/support/store");
    if (press) {
      const arm = deps.support?.armFollowup ?? store?.armSupportFollow;
      const armed = arm ? await arm(press.chatId, press.ticketId) : null;
      return {
        chatId: press.chatId,
        text: armed?.text ?? "Це звернення вже недоступне.",
        disablePreview: true,
      };
    }
    if (!note) return null;
    const followWaiting = deps.support?.peekFollow
      ? await deps.support.peekFollow(note.chatId)
      : store
        ? await store.peekSupportFollow(note.chatId)
        : false;
    const waiting = deps.support?.peek
      ? await deps.support.peek(note.chatId)
      : await store!.peekSupportWait(note.chatId);
    const decision = intakeDecision(note, waiting || followWaiting);
    if (decision === "cancel") {
      if (deps.support?.cancel) await deps.support.cancel(note.chatId);
      else await store!.cancelSupportWait(note.chatId);
      if (deps.support?.cancelFollow) await deps.support.cancelFollow(note.chatId);
      return null;
    }
    const acceptFollow = deps.support?.acceptFollowup ?? store?.acceptSupportFollowup;
    if (acceptFollow && note.body && !note.navigation && (note.replyToMessageId || followWaiting)) {
      const followed = await acceptFollow({
        chatId: note.chatId,
        body: note.body,
        kind: note.kind,
        replyToMessageId: note.replyToMessageId,
      });
      if (followed) return { chatId: note.chatId, text: followed.text, disablePreview: true };
    }
    if (decision !== "ticket" || !note.body) return null;
    const accepted = deps.support?.accept
      ? await deps.support.accept({ chatId: note.chatId, body: note.body, kind: note.kind })
      : await store!.acceptSupportMessage({ chatId: note.chatId, body: note.body, kind: note.kind });
    return accepted ? { chatId: note.chatId, text: accepted.text, disablePreview: true } : null;
  } catch (error) {
    log(error);
    return null;
  }
}

async function captureSurvey(
  update: unknown,
  deps: {
    survey?: {
      takeText?: (chatId: string, body: string) => Promise<SurveyPrompt | null>;
    };
  },
  log: (error: unknown) => void,
): Promise<TelegramReply | null> {
  const note = readSurveyNote(update);
  if (!note || note.navigation) return null;
  try {
    let prompt: SurveyPrompt | null = null;
    if (deps.survey?.takeText) {
      prompt = await deps.survey.takeText(note.chatId, note.body);
    } else if (process.env.DB_HOST) {
      const { takeSurveyText } = await import("@/modules/marathons/daily/surveyStore");
      prompt = await takeSurveyText(note.chatId, note.body);
    }
    if (!prompt) return null;
    return {
      chatId: note.chatId,
      text: prompt.text,
      ...(prompt.buttons.length
        ? {
            replyMarkup: {
              inline_keyboard: prompt.buttons.map((button) => [{
                text: button.text,
                callback_data: button.data,
              }]),
            },
          }
        : {}),
    };
  } catch (error) {
    log(error);
    return null;
  }
}
