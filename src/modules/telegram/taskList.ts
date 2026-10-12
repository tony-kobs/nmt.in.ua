import "server-only";
import { getTelegramTaskSessions, getTelegramTodayTaskSessions } from "./tasks";
import { formatTelegramTasks } from "./taskCommands";
import { createTaskReference } from "./taskReference";
import type { InlineKeyboard, TelegramReply } from "./taskInteraction";
import { MENU, navRow, NOT_LINKED_TEXT } from "./ui";

export type TaskListDeps = {
  getTasks?: typeof getTelegramTaskSessions;
  getTodayTasks?: typeof getTelegramTodayTaskSessions;
  referenceSecret?: string;
  logError?: (error: unknown) => void;
};

/** `/tasks`, `/today` and their menu buttons share this reply, so both paths keep TG-003–TG-006 rules. */
export async function buildTaskListReply(
  request: { chatId: string; userId: string; today: boolean; editMessageId?: number },
  deps: TaskListDeps,
): Promise<TelegramReply> {
  const { chatId, userId, today } = request;
  const edit = request.editMessageId !== undefined ? { editMessageId: request.editMessageId } : {};
  try {
    const service = today
      ? deps.getTodayTasks ?? getTelegramTodayTaskSessions
      : deps.getTasks ?? getTelegramTaskSessions;
    const result = await service(userId);
    if (result.status === "error") {
      return { chatId, text: result.code === "databaseFailure"
        ? "Не вдалося отримати завдання. Спробуйте пізніше."
        : NOT_LINKED_TEXT, ...edit };
    }
    const secret = deps.referenceSecret ?? process.env.TELEGRAM_WEBHOOK_SECRET;
    const references = new Map<number, string>();
    const text = formatTelegramTasks(result.sessions, today, secret ? (id) => {
      const reference = createTaskReference(id, userId, secret);
      references.set(id, reference);
      return reference;
    } : undefined);
    const rows: InlineKeyboard["inline_keyboard"] = result.sessions.filter((session) => {
      const reference = references.get(session.sessionId);
      return reference && text.includes(`/done ${reference}`);
    }).map((session, index) => [
      { text: `${index + 1}. Деталі`, callback_data: `d:${references.get(session.sessionId)}` },
      { text: "✅ Завершити", callback_data: `a:${references.get(session.sessionId)}` },
    ]);
    rows.push(today
      ? [{ text: "📚 Усі завдання", callback_data: MENU.tasks }, ...navRow()]
      : [{ text: "📅 Сьогодні", callback_data: MENU.today }, ...navRow()]);
    return { chatId, text, parseMode: "HTML", disablePreview: true, replyMarkup: { inline_keyboard: rows }, ...edit };
  } catch (error) {
    if (deps.logError) deps.logError(error);
    else console.error("telegram tasks: command failed", error);
    return { chatId, text: "Не вдалося отримати завдання. Спробуйте пізніше.", ...edit };
  }
}
