import "server-only";
import { getTelegramTaskDetails } from "./taskDetails";
import { completeTelegramTask } from "./completeTask";
import { createTaskReference, resolveTaskReference } from "./taskReference";
import { TELEGRAM_TASK_TIME_ZONE } from "./taskDay";

export type InlineKeyboard = { inline_keyboard: { text: string; callback_data?: string; url?: string }[][] };
export type TelegramReply = {
  chatId: string;
  text: string;
  parseMode?: "HTML";
  replyMarkup?: InlineKeyboard;
  /** YouTube or Loom, shown as a large link preview above the text. */
  linkPreviewUrl?: string;
  photoUrl?: string;
  albumUrls?: string[];
  videoUrl?: string;
  videoFileId?: string;
  formulaTex?: string;
  formulaDisplay?: boolean;
  siteUrl?: string;
  siteLabel?: string;
  /** Further messages. Not sent as part of the Telegram payload. */
  continuation?: TelegramReply[];
};
export type TaskCallback = { queryId: string; chatId: string; userId: string; action: "d" | "a" | "y" | "n" | null; reference: string };

export function parseTaskCallback(update: unknown): TaskCallback | null {
  if (!update || typeof update !== "object") return null;
  const q = (update as { callback_query?: { id?: unknown; data?: unknown; from?: { id?: number }; message?: { chat?: { id?: number; type?: string } } } }).callback_query;
  if (!q || typeof q.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(q.id) || !q.from || !q.message?.chat ||
    !Number.isSafeInteger(q.from.id) || Number(q.from.id) <= 0 || q.message.chat.type !== "private" || q.message.chat.id !== q.from.id) return null;
  const match = typeof q.data === "string" && q.data.length <= 64 ? /^([dayn]):([A-Za-z0-9_-]{39,59})$/.exec(q.data) : null;
  return { queryId: q.id, chatId: String(q.from.id), userId: String(q.from.id), action: match ? match[1] as TaskCallback["action"] : null, reference: match?.[2] ?? "" };
}

const labels = { available: "Доступне", completed: "Вже завершено", expired: "Термін дії сплинув", cancelled: "Скасовано", waiting: "Ще недоступне", unavailable: "Недоступне" };
const invalidText = "Посилання недійсне або завдання більше недоступне. Оновіть список через /tasks або /today.";

export async function handleTaskCallback(callback: TaskCallback, deps: {
  secret: string; getDetails?: typeof getTelegramTaskDetails; completeTask?: typeof completeTelegramTask;
}): Promise<TelegramReply> {
  const reply = (text: string, replyMarkup?: InlineKeyboard): TelegramReply => ({ chatId: callback.chatId, text, ...(replyMarkup ? { replyMarkup } : {}) });
  const { action, reference, userId } = callback;
  if (!action) return reply(invalidText);
  const id = resolveTaskReference(reference, action === "y" ? `${userId}:confirm` : userId, deps.secret);
  if (!id) return reply(invalidText);
  if (action === "n") return reply("Завершення скасовано.");
  const taskReference = action === "y" ? createTaskReference(id, userId, deps.secret) : reference;
  const result = await (deps.getDetails ?? getTelegramTaskDetails)(userId, taskReference);
  if (result.status === "error") return reply(result.code === "notLinked"
    ? "Спочатку підключіть Telegram у своєму кабінеті на nmt.in.ua."
    : result.code === "databaseFailure" ? "Не вдалося отримати завдання. Спробуйте пізніше." : invalidText);
  const task = result.task;
  const text = `${task.title}\nСтатус: ${labels[task.state]}` + (task.expiresAt ? `\nТермін: ${new Intl.DateTimeFormat("uk-UA", { timeZone: TELEGRAM_TASK_TIME_ZONE, dateStyle: "short", timeStyle: "short" }).format(task.expiresAt * 1000)}` : "");
  if (task.state !== "available") return reply(text);
  if (action === "y") {
    const completion = await (deps.completeTask ?? completeTelegramTask)(userId, taskReference);
    return reply(completion.status === "success" ? "Завдання завершено."
      : completion.code === "notLinked" ? "Спочатку підключіть Telegram у своєму кабінеті на nmt.in.ua."
      : completion.code === "databaseFailure" ? "Не вдалося завершити завдання. Спробуйте пізніше."
      : "Це завдання не можна завершити. Перевірте його стан і відповіді в кабінеті.");
  }
  if (action === "a") {
    const confirmation = createTaskReference(id, `${userId}:confirm`, deps.secret);
    return reply(`${text}\n\nПідтвердити завершення? Усі відповіді мають бути збережені в кабінеті.`, { inline_keyboard: [[
      { text: "Так, завершити", callback_data: `y:${confirmation}` }, { text: "Скасувати", callback_data: `n:${reference}` },
    ]] });
  }
  return reply(text, { inline_keyboard: [[{ text: "Завершити", callback_data: `a:${reference}` }, { text: "Відкрити кабінет", url: "https://nmt.in.ua/sessions" }]] });
}
