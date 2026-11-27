import { formatSessionStartTime } from "@/modules/sessions/types";

export const ASSIGNED_SESSION_KIND = "session.assigned";
export const TOPIC_REMINDER_KIND = "topic.reminder";

export type SiteNote = {
  kind: string;
  title: string;
  body: string;
  link: string;
};

/** Keys in the `Notifications` namespace of messages/*.json. */
const TITLE_KEYS = ["assignedTitle", "reminderTitle"] as const;
const BODY_KEYS = ["assignedBodyNoStart", "assignedBodyWithStart", "reminderBody"] as const;
type TitleKey = (typeof TITLE_KEYS)[number];
type BodyKey = (typeof BODY_KEYS)[number];

/**
 * A student note is stored as message keys + params (JSON in `body`) and translated when the
 * student opens the bell, so each student reads it in their own interface language.
 */
export type NoteMessage = {
  v: 1;
  title: TitleKey;
  body: BodyKey;
  params: { themeName: string; tasksNumber?: number; dueAt?: number; startAt?: number };
};

function toNote(kind: string, sessionId: number, message: NoteMessage): SiteNote {
  return {
    kind,
    title: message.title,
    body: JSON.stringify(message),
    link: `/session/${sessionId}`,
  };
}

export function assignedSessionNotification(input: {
  themeName: string;
  tasksNumber: number;
  sessionId: number;
  availableAt: number;
  dueAt: number;
  nowSec: number;
}): SiteNote {
  const opensLater = input.availableAt > input.nowSec;
  return toNote(ASSIGNED_SESSION_KIND, input.sessionId, {
    v: 1,
    title: "assignedTitle",
    body: opensLater ? "assignedBodyWithStart" : "assignedBodyNoStart",
    params: {
      themeName: input.themeName.trim(),
      tasksNumber: input.tasksNumber,
      dueAt: input.dueAt,
      ...(opensLater ? { startAt: input.availableAt } : {}),
    },
  });
}

export function topicTestReminder(input: { themeName: string; sessionId: number }): SiteNote {
  return toNote(TOPIC_REMINDER_KIND, input.sessionId, {
    v: 1,
    title: "reminderTitle",
    body: "reminderBody",
    params: { themeName: input.themeName.trim() },
  });
}

/** The stored message, or null for older notes saved as plain text (shown as they are). */
export function readNoteMessage(body: string): NoteMessage | null {
  if (!body.startsWith("{")) return null;
  try {
    const value = JSON.parse(body) as Partial<NoteMessage> | null;
    if (
      value?.v !== 1 ||
      !TITLE_KEYS.includes(value.title as TitleKey) ||
      !BODY_KEYS.includes(value.body as BodyKey) ||
      typeof value.params?.themeName !== "string"
    ) {
      return null;
    }
    return value as NoteMessage;
  } catch {
    return null;
  }
}

/** Values for the translated body: dates in the reader's locale, a fallback for a missing theme. */
export function noteMessageValues(
  message: NoteMessage,
  locale: string,
  unknownTheme: string,
): Record<string, string | number> {
  const { themeName, tasksNumber, dueAt, startAt } = message.params;
  return {
    themeName: themeName || unknownTheme,
    tasksNumber: tasksNumber ?? 0,
    dueAt: formatSessionStartTime(dueAt ?? 0, locale),
    startAt: formatSessionStartTime(startAt ?? 0, locale),
  };
}
