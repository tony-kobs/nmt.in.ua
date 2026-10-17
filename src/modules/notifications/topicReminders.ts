import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { nowUnixSec } from "@/modules/testing/sessionElapsed";
import {
  assignedSessionNotification,
  topicTestReminder,
  type SiteNote,
} from "./studentNotes";
import { notifyUser } from "./store";

const OPEN_TOPIC_LIMIT = 5;

type Conn = () => Promise<SqlConnection>;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

export type AssignedSessionNotice = {
  userId: number;
  themeName: string;
  tasksNumber: number;
  sessionId: number;
  availableAt: number;
  dueAt: number;
  nowSec: number;
};

/**
 * One bell row per newly planned teacher session. A repeat of the same
 * session link does not add another row.
 */
export async function notifyAssignedSessions(
  notes: AssignedSessionNotice[],
  tell: typeof notifyUser = notifyUser,
): Promise<void> {
  for (const note of notes) {
    if (!Number.isInteger(note.userId) || note.userId <= 0) continue;
    if (!Number.isInteger(note.sessionId) || note.sessionId <= 0) continue;
    const message: SiteNote = assignedSessionNotification(note);
    try {
      await tell({ userId: note.userId, ...message, once: true });
    } catch (error) {
      console.error("assigned session notification", error);
    }
  }
}

/**
 * Bell reminder for topic tests the student started and has not finished.
 * Called from the cabinet layout. `once` keeps one row per session.
 */
export async function ensureTopicTestReminders(
  userId: number,
  deps: { getConnection?: Conn; nowSec?: () => number; notify?: typeof notifyUser } = {},
): Promise<void> {
  if (!Number.isInteger(userId) || userId <= 0) return;
  const getConnection = deps.getConnection ?? loadDefaultConnection;
  const nowSec = (deps.nowSec ?? nowUnixSec)();
  const tell = deps.notify ?? notifyUser;
  const connection = await getConnection();
  let rows: { id: number; theme_name: string }[] = [];
  try {
    rows = await connection.query<{ id: number; theme_name: string }>(
      `SELECT ts.id, t.name AS theme_name
       FROM task_sessions ts
       INNER JOIN themes t ON t.id = ts.theme_id
       WHERE ts.user_id = ?
         AND ts.session_type = 1
         AND ts.expire_time > ?
         AND ts.session_status <> 1
         AND NOT (
           ts.tasks_number > 0
           AND ts.right_number >= ts.tasks_number
           AND ts.time > 0
         )
       ORDER BY ts.id DESC
       LIMIT ${OPEN_TOPIC_LIMIT}`,
      [userId, nowSec],
    );
  } finally {
    connection.release();
  }

  for (const row of rows) {
    const message = topicTestReminder({
      themeName: row.theme_name,
      sessionId: Number(row.id),
    });
    try {
      await tell({ userId, ...message, once: true });
    } catch (error) {
      console.error("topic test reminder", error);
    }
  }
}
