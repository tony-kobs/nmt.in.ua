import { SESSION_STATUS_CREATED } from "@/modules/sessions/types";
import type { TelegramTaskSession } from "./tasks";
import { cleanTitle, effectiveDeadline, formatKyivDateTime, html } from "./ui";

/** Telegram HTML. Theme names are escaped; references are base64url and safe as-is. */
export function formatTelegramTasks(sessions: TelegramTaskSession[], today: boolean, reference?: (sessionId: number) => string): string {
  if (!sessions.length) {
    return today
      ? "📅 На сьогодні завдань немає."
      : "📚 Зараз у вас немає актуальних завдань.";
  }
  let text = today ? "<b>📅 Завдання на сьогодні</b>" : "<b>📚 Ваші завдання</b>";
  for (const [index, session] of sessions.entries()) {
    const status = session.status === SESSION_STATUS_CREATED ? "Створено" : "Заплановано";
    const deadline = effectiveDeadline(session);
    const entry = `\n\n<b>${index + 1}. ${html(cleanTitle(session.themeName))}</b>` +
      `\nВиконано: ${session.completedTaskCount}/${session.taskCount} · ${status}` +
      (deadline ? `\n⏰ Термін: ${formatKyivDateTime(deadline)}` : "") +
      (reference ? `\nЗавершити: /done ${reference(session.sessionId)}` : "");
    if (text.length + entry.length > 3900) {
      text += "\n\nРешта завдань — у кабінеті на nmt.in.ua.";
      break;
    }
    text += entry;
  }
  return text;
}
