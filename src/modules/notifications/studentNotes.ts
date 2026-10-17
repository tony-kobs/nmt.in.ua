import { formatSessionStartTime } from "@/modules/sessions/types";

export const ASSIGNED_SESSION_KIND = "session.assigned";
export const TOPIC_REMINDER_KIND = "topic.reminder";

export type SiteNote = {
  kind: string;
  title: string;
  body: string;
  link: string;
};

export function assignedSessionNotification(input: {
  themeName: string;
  tasksNumber: number;
  sessionId: number;
  availableAt: number;
  dueAt: number;
  nowSec: number;
}): SiteNote {
  const theme = input.themeName.trim() || "обраною темою";
  const due = formatSessionStartTime(input.dueAt);
  const opensLater = input.availableAt > input.nowSec;
  const start = opensLater
    ? ` Старт: ${formatSessionStartTime(input.availableAt)}.`
    : "";
  return {
    kind: ASSIGNED_SESSION_KIND,
    title: "Заплановано тест",
    body: `Викладач призначив тест за темою «${theme}» (${input.tasksNumber} завдань).${start} Термін: ${due}.`,
    link: `/session/${input.sessionId}`,
  };
}

export function topicTestReminder(input: {
  themeName: string;
  sessionId: number;
}): SiteNote {
  const theme = input.themeName.trim() || "обраною темою";
  return {
    kind: TOPIC_REMINDER_KIND,
    title: "Тест за темою",
    body: `Завершіть тест за темою «${theme}».`,
    link: `/session/${input.sessionId}`,
  };
}
