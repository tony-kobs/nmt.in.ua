import { SESSION_STATUS_CREATED } from "@/modules/sessions/types";
import type { TelegramTaskSession } from "./tasks";
import { TELEGRAM_TASK_TIME_ZONE } from "./taskDay";

const deadlineFormatter = new Intl.DateTimeFormat("uk-UA", {
  timeZone: TELEGRAM_TASK_TIME_ZONE,
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});

export function formatTelegramTasks(sessions: TelegramTaskSession[], today: boolean): string {
  if (!sessions.length) return today ? "На сьогодні завдань немає." : "Зараз у вас немає актуальних завдань.";
  let text = today ? "Завдання на сьогодні:" : "Ваші завдання:";
  for (const [index, session] of sessions.entries()) {
    const title = Array.from((session.themeName || "Навчальна сесія").replace(/\s+/g, " ")).slice(0, 120).join("");
    const status = session.status === SESSION_STATUS_CREATED ? "Створено" : "Заплановано";
    const entry = `\n\n${index + 1}. ${title}\nСтатус: ${status}\nВиконано: ${session.completedTaskCount}/${session.taskCount}` +
      (session.expiresAt ? `\nТермін: ${deadlineFormatter.format(session.expiresAt * 1000)}` : "");
    if (text.length + entry.length > 3900) {
      text += "\n\nРешта завдань — у кабінеті на nmt.in.ua.";
      break;
    }
    text += entry;
  }
  return text;
}
