import { SESSION_STATUS_CREATED, SESSION_TYPE_AUTO, SESSION_TYPE_MENTOR } from "@/modules/sessions/types";
import type { TelegramTaskSession } from "./tasks";
import { cleanTitle, effectiveDeadline, formatKyivDateTime, html } from "./ui";

/** Telegram HTML. Theme names are escaped; references are base64url and safe as-is. */
export function formatTelegramTasks(sessions: TelegramTaskSession[], today: boolean, reference?: (sessionId: number) => string): string {
  if (!sessions.length) {
    return today
      ? "📅 На сьогодні завдань немає."
      : "📚 Завдань від викладача чи платформи зараз немає.";
  }
  let text = today ? "<b>📅 Завдання на сьогодні</b>" : "<b>📚 Мої завдання</b>";
  for (const [index, session] of sessions.entries()) {
    const status = session.status === SESSION_STATUS_CREATED ? "Створено" : "Заплановано";
    const source = session.sessionType === SESSION_TYPE_MENTOR
      ? "Від викладача"
      : session.sessionType === SESSION_TYPE_AUTO
        ? "Пропозиція платформи"
        : "";
    const deadline = effectiveDeadline(session);
    const entry = `\n\n<b>${index + 1}. ${html(cleanTitle(session.themeName))}</b>` +
      (source ? `\n${source}` : "") +
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
