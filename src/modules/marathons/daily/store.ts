import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { evaluateDayAccess } from "./calendar";
import { isDeliveryChannel, notifyFlags } from "./channel";
import { isCopyKey, type CopyKey } from "./copy";
import type { NotifyIntent, NotifyKind } from "./notifications";
import {
  parseStoredAnswers,
  PENDING_TASK_SQL,
  projectPendingTask,
  projectReviewedTask,
  REVIEW_TASK_SQL,
  type PendingPlayTask,
  type ReviewedPlayTask,
  type TaskSourceRow,
} from "./playTasks";
import {
  applyRankSnapshot,
  publicLeaderName,
  rankParticipants,
  type BoardLine,
  type RankInput,
} from "./leaderboard";
import { submitOpenedDay, type SubmitSuccess } from "./submit";
import type { ProgressMark } from "./streak";

export type DailyStatus = "draft" | "active" | "finished";
export type MaterialType = "loom" | "youtube" | "text";

export type DailyMarathon = {
  id: number;
  slug: string;
  title: string;
  subject: string;
  startDate: string;
  unlockHour: string;
  daysCount: number;
  passThreshold: number;
  finalCtaText: string;
  finalCtaUrl: string;
  introVideoUrl: string;
  status: DailyStatus;
};

export type Riddle = {
  id: number;
  order: number;
  title: string;
  body: string;
  answer: string;
  hint: string | null;
};

export type MarathonDay = {
  id: number;
  dayNumber: number;
  topic: string;
  introText: string | null;
};

export type Material = {
  id: number;
  order: number;
  type: MaterialType;
  urlOrBody: string;
};

export type PlayTask = PendingPlayTask;

export type Participant = {
  userId: number;
  source: string | null;
  streak: number;
  finishedAt: string | null;
  convertedAt: string | null;
  telegramChatId: string | null;
  notifyEmail: boolean;
  notifyBot: boolean;
  channel: "site" | "telegram" | null;
  introSeen: boolean;
  notifyPaused: boolean;
  email: string | null;
  displayName: string;
};

export type DayProgress = {
  dayId: number;
  dayNumber: number;
  materialsViewed: boolean;
  score: number | null;
  passed: boolean;
  completedAt: number | null;
  answers: Record<number, number>;
  correctCount: number | null;
};

export type ParticipantReport = {
  userId: number;
  displayName: string;
  login: string;
  email: string | null;
  emailVerified: boolean;
  source: string | null;
  streak: number;
  finished: boolean;
  converted: boolean;
  days: Array<{ dayNumber: number; score: number | null; passed: boolean; completed: boolean }>;
};

type Conn = () => Promise<SqlConnection>;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

async function withConn<T>(
  fn: (connection: SqlConnection) => Promise<T>,
  getConnection: Conn = loadDefaultConnection,
): Promise<T> {
  const { ensureMarathonSchema } = await import("../schema");
  await ensureMarathonSchema(getConnection);
  const connection = await getConnection();
  try {
    return await fn(connection);
  } finally {
    connection.release();
  }
}

function flag(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function isoDate(value: unknown): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? ""));
  return match?.[1] ?? "";
}

function asMs(value: unknown): number | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  const ms = date.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function mapMarathon(row: {
  id: number;
  slug: string;
  title: string;
  subject: string;
  start_date: unknown;
  unlock_hour: string;
  days_count: number;
  pass_threshold: number;
  final_cta_text: string | null;
  final_cta_url: string | null;
  intro_video_url?: string | null;
  status: string;
}): DailyMarathon | null {
  if (row.status !== "draft" && row.status !== "active" && row.status !== "finished") {
    return null;
  }
  const startDate = isoDate(row.start_date);
  if (!startDate) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subject: row.subject,
    startDate,
    unlockHour: String(row.unlock_hour).slice(0, 5),
    daysCount: Number(row.days_count),
    passThreshold: Number(row.pass_threshold),
    finalCtaText: row.final_cta_text ?? "",
    finalCtaUrl: row.final_cta_url ?? "",
    introVideoUrl: row.intro_video_url ?? "",
    status: row.status,
  };
}

const MARATHON_SELECT = `id, slug, title, subject, start_date, unlock_hour, days_count,
  pass_threshold, final_cta_text, final_cta_url, intro_video_url, status`;

export async function listDailyMarathons(getConnection?: Conn): Promise<DailyMarathon[]> {
  return withConn(async (connection) => {
    const rows = await connection.query<Parameters<typeof mapMarathon>[0]>(
      `SELECT ${MARATHON_SELECT} FROM marathons WHERE kind = 'daily' ORDER BY id DESC`,
      [],
    );
    return rows.flatMap((row) => {
      const marathon = mapMarathon(row);
      return marathon ? [marathon] : [];
    });
  }, getConnection);
}

export async function getDailyBySlug(
  slug: string,
  getConnection?: Conn,
): Promise<DailyMarathon | null> {
  return withConn(async (connection) => {
    const rows = await connection.query<Parameters<typeof mapMarathon>[0]>(
      `SELECT ${MARATHON_SELECT} FROM marathons WHERE slug = ? AND kind = 'daily' LIMIT 1`,
      [slug],
    );
    return rows[0] ? mapMarathon(rows[0]) : null;
  }, getConnection);
}

export async function getDailyById(
  id: number,
  getConnection?: Conn,
): Promise<DailyMarathon | null> {
  return withConn(async (connection) => {
    const rows = await connection.query<Parameters<typeof mapMarathon>[0]>(
      `SELECT ${MARATHON_SELECT} FROM marathons WHERE id = ? AND kind = 'daily' LIMIT 1`,
      [id],
    );
    return rows[0] ? mapMarathon(rows[0]) : null;
  }, getConnection);
}

export async function insertDailyMarathon(
  input: Omit<DailyMarathon, "id" | "status"> & { startsAt: number; endsAt: number },
  getConnection?: Conn,
): Promise<number> {
  return withConn(async (connection) => {
    const result = await connection.execute(
      `INSERT INTO marathons
        (slug, title, description, status, starts_at, ends_at, min_tasks_per_session,
         kind, subject, start_date, unlock_hour, days_count, pass_threshold,
         final_cta_text, final_cta_url, intro_video_url)
       VALUES (?, ?, ?, 'draft', ?, ?, 5, 'daily', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.slug,
        input.title,
        input.subject,
        input.startsAt,
        input.endsAt,
        input.subject,
        input.startDate,
        input.unlockHour,
        input.daysCount,
        input.passThreshold,
        input.finalCtaText,
        input.finalCtaUrl,
        input.introVideoUrl || null,
      ],
    );
    return result.insertId;
  }, getConnection);
}

export async function updateDailyMarathon(
  id: number,
  input: Omit<DailyMarathon, "id" | "status"> & { startsAt: number; endsAt: number },
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `UPDATE marathons
       SET slug = ?, title = ?, subject = ?, start_date = ?, unlock_hour = ?,
           days_count = ?, pass_threshold = ?, final_cta_text = ?, final_cta_url = ?,
           intro_video_url = ?, starts_at = ?, ends_at = ?
       WHERE id = ? AND kind = 'daily'`,
      [
        input.slug,
        input.title,
        input.subject,
        input.startDate,
        input.unlockHour,
        input.daysCount,
        input.passThreshold,
        input.finalCtaText,
        input.finalCtaUrl,
        input.introVideoUrl || null,
        input.startsAt,
        input.endsAt,
        id,
      ],
    );
  }, getConnection);
}

export async function setDailyStatus(
  id: number,
  status: DailyStatus,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `UPDATE marathons SET status = ? WHERE id = ? AND kind = 'daily'`,
      [status, id],
    );
  }, getConnection);
}

export async function deleteDailyMarathon(id: number, getConnection?: Conn): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `DELETE t FROM marathon_day_tasks t
       INNER JOIN marathon_days d ON d.id = t.day_id
       WHERE d.marathon_id = ?`,
      [id],
    );
    await connection.execute(
      `DELETE m FROM marathon_day_materials m
       INNER JOIN marathon_days d ON d.id = m.day_id
       WHERE d.marathon_id = ?`,
      [id],
    );
    await connection.execute(
      `DELETE pr FROM marathon_day_progress pr
       INNER JOIN marathon_days d ON d.id = pr.day_id
       WHERE d.marathon_id = ?`,
      [id],
    );
    await connection.execute(`DELETE FROM marathon_days WHERE marathon_id = ?`, [id]);
    await connection.execute(`DELETE FROM marathon_riddles WHERE marathon_id = ?`, [id]);
    await connection.execute(`DELETE FROM marathon_notifications WHERE marathon_id = ?`, [id]);
    await connection.execute(`DELETE FROM marathon_bot_links WHERE marathon_id = ?`, [id]);
    await connection.execute(`DELETE FROM marathon_participants WHERE marathon_id = ?`, [id]);
    await connection.execute(`DELETE FROM marathons WHERE id = ? AND kind = 'daily'`, [id]);
  }, getConnection);
}

export async function listRiddles(marathonId: number, getConnection?: Conn): Promise<Riddle[]> {
  return withConn(async (connection) => {
    const rows = await connection.query<{
      id: number;
      sort_order: number;
      title: string;
      body: string;
      answer: string;
      hint: string | null;
    }>(
      `SELECT id, sort_order, title, body, answer, hint
       FROM marathon_riddles WHERE marathon_id = ? ORDER BY sort_order`,
      [marathonId],
    );
    return rows.map((row) => ({
      id: row.id,
      order: row.sort_order,
      title: row.title,
      body: row.body,
      answer: row.answer,
      hint: row.hint,
    }));
  }, getConnection);
}

export async function insertRiddle(
  marathonId: number,
  input: Omit<Riddle, "id">,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `INSERT INTO marathon_riddles (marathon_id, sort_order, title, body, answer, hint)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [marathonId, input.order, input.title, input.body, input.answer, input.hint],
    );
  }, getConnection);
}

export async function deleteRiddle(
  marathonId: number,
  riddleId: number,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `DELETE FROM marathon_riddles WHERE id = ? AND marathon_id = ?`,
      [riddleId, marathonId],
    );
  }, getConnection);
}

export async function listDays(marathonId: number, getConnection?: Conn): Promise<MarathonDay[]> {
  return withConn(async (connection) => {
    const rows = await connection.query<{
      id: number;
      day_number: number;
      topic: string;
      intro_text: string | null;
    }>(
      `SELECT id, day_number, topic, intro_text
       FROM marathon_days WHERE marathon_id = ? ORDER BY day_number`,
      [marathonId],
    );
    return rows.map((row) => ({
      id: row.id,
      dayNumber: row.day_number,
      topic: row.topic,
      introText: row.intro_text,
    }));
  }, getConnection);
}

export async function insertDay(
  marathonId: number,
  input: Omit<MarathonDay, "id">,
  getConnection?: Conn,
): Promise<number> {
  return withConn(async (connection) => {
    const result = await connection.execute(
      `INSERT INTO marathon_days (marathon_id, day_number, topic, intro_text)
       VALUES (?, ?, ?, ?)`,
      [marathonId, input.dayNumber, input.topic, input.introText],
    );
    return result.insertId;
  }, getConnection);
}

export async function updateDay(
  marathonId: number,
  dayId: number,
  input: { topic: string; introText: string },
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `UPDATE marathon_days SET topic = ?, intro_text = ?
       WHERE id = ? AND marathon_id = ?`,
      [input.topic, input.introText, dayId, marathonId],
    );
  }, getConnection);
}

export async function deleteDay(
  marathonId: number,
  dayId: number,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `DELETE FROM marathon_day_tasks WHERE day_id = ?`,
      [dayId],
    );
    await connection.execute(
      `DELETE FROM marathon_day_materials WHERE day_id = ?`,
      [dayId],
    );
    await connection.execute(
      `DELETE FROM marathon_day_progress WHERE day_id = ?`,
      [dayId],
    );
    await connection.execute(
      `DELETE FROM marathon_days WHERE id = ? AND marathon_id = ?`,
      [dayId, marathonId],
    );
  }, getConnection);
}

export async function listMaterials(dayId: number, getConnection?: Conn): Promise<Material[]> {
  return withConn(async (connection) => {
    const rows = await connection.query<{
      id: number;
      sort_order: number;
      material_type: MaterialType;
      url_or_body: string;
    }>(
      `SELECT id, sort_order, material_type, url_or_body
       FROM marathon_day_materials WHERE day_id = ? ORDER BY sort_order`,
      [dayId],
    );
    return rows.map((row) => ({
      id: row.id,
      order: row.sort_order,
      type: row.material_type,
      urlOrBody: row.url_or_body,
    }));
  }, getConnection);
}

export async function insertMaterial(
  dayId: number,
  input: Omit<Material, "id">,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `INSERT INTO marathon_day_materials (day_id, sort_order, material_type, url_or_body)
       VALUES (?, ?, ?, ?)`,
      [dayId, input.order, input.type, input.urlOrBody],
    );
  }, getConnection);
}

export async function deleteMaterial(
  dayId: number,
  materialId: number,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `DELETE FROM marathon_day_materials WHERE id = ? AND day_id = ?`,
      [materialId, dayId],
    );
  }, getConnection);
}

export async function updateMaterial(
  dayId: number,
  materialId: number,
  input: Omit<Material, "id">,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `UPDATE marathon_day_materials
       SET sort_order = ?, material_type = ?, url_or_body = ?
       WHERE id = ? AND day_id = ?`,
      [input.order, input.type, input.urlOrBody, materialId, dayId],
    );
  }, getConnection);
}

async function loadReviewRows(
  connection: SqlConnection,
  dayId: number,
): Promise<TaskSourceRow[]> {
  return connection.query<TaskSourceRow>(REVIEW_TASK_SQL, [dayId]);
}

/** Prompt and options only. Does not select the key or the explanation. */
export async function listPendingTasks(
  dayId: number,
  getConnection?: Conn,
): Promise<PendingPlayTask[]> {
  return withConn(async (connection) => {
    const rows = await connection.query<TaskSourceRow>(PENDING_TASK_SQL, [dayId]);
    return rows.flatMap((row) => {
      const task = projectPendingTask(row);
      return task ? [task] : [];
    });
  }, getConnection);
}

export async function listTaskReview(
  dayId: number,
  answers: Record<number, number>,
  getConnection?: Conn,
): Promise<ReviewedPlayTask[]> {
  return withConn(async (connection) => {
    const rows = await loadReviewRows(connection, dayId);
    return rows.flatMap((row) => {
      const task = projectReviewedTask(row, answers);
      return task ? [task] : [];
    });
  }, getConnection);
}

export async function listAdminTasks(
  dayId: number,
  getConnection?: Conn,
): Promise<Array<PlayTask & { correct: number; questionId: number | null }>> {
  return withConn(async (connection) => {
    const rows = await loadReviewRows(connection, dayId);
    return rows.flatMap((row) => {
      const task = projectReviewedTask(row, {});
      if (!task) {
        return [{
          id: row.id,
          order: row.sort_order,
          prompt: row.inline_prompt || row.task_text || `Завдання #${row.question_id ?? row.id}`,
          options: [],
          correct: Number(row.inline_correct ?? row.right_answer_n ?? 0),
          questionId: row.question_id ?? null,
        }];
      }
      return [{
        id: task.id,
        order: task.order,
        prompt: task.prompt,
        options: task.options,
        correct: task.correct,
        questionId: row.question_id ?? null,
      }];
    });
  }, getConnection);
}

export async function insertTask(
  dayId: number,
  input: {
    order: number;
    questionId: number | null;
    prompt: string | null;
    options: string[] | null;
    correct: number | null;
    explanation?: string | null;
  },
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `INSERT INTO marathon_day_tasks
        (day_id, sort_order, question_id, inline_prompt, inline_options, inline_correct, inline_explanation)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        dayId,
        input.order,
        input.questionId,
        input.prompt,
        input.options ? JSON.stringify(input.options) : null,
        input.correct,
        input.explanation?.trim() || null,
      ],
    );
  }, getConnection);
}

export async function deleteTask(
  dayId: number,
  taskId: number,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `DELETE FROM marathon_day_tasks WHERE id = ? AND day_id = ?`,
      [taskId, dayId],
    );
  }, getConnection);
}

export async function quizTaskExists(
  id: number,
  getConnection?: Conn,
): Promise<boolean> {
  if (!Number.isInteger(id) || id <= 0) return false;
  return withConn(async (connection) => {
    const rows = await connection.query<{ id: number }>(
      `SELECT id FROM quiz_tasks WHERE id = ? LIMIT 1`,
      [id],
    );
    return Boolean(rows[0]);
  }, getConnection);
}

export async function searchQuizTasks(
  query: string,
  getConnection?: Conn,
): Promise<Array<{ id: number; label: string }>> {
  const term = query.trim().slice(0, 80);
  if (!term) return [];
  const like = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
  return withConn(async (connection) => {
    const rows = await connection.query<{ id: number; name: string | null; task_text: string }>(
      `SELECT id, name, task_text FROM quiz_tasks
       WHERE CAST(id AS CHAR) = ? OR name LIKE ? ESCAPE '\\\\' OR task_text LIKE ? ESCAPE '\\\\'
       ORDER BY id DESC LIMIT 12`,
      [term, like, like],
    );
    return rows.map((row) => ({
      id: row.id,
      label: `${row.id}. ${(row.name || row.task_text).slice(0, 120)}`,
    }));
  }, getConnection);
}

function mapParticipant(row: {
  user_id: number;
  source: string | null;
  streak: number;
  finished_at: unknown;
  converted_at: unknown;
  telegram_chat_id: number | string | null;
  notify_email: number;
  notify_bot: number;
  delivery_channel: string | null;
  intro_seen_at: unknown;
  notify_paused: number;
  email: string | null;
  display_name: string | null;
}): Participant {
  const channel = isDeliveryChannel(row.delivery_channel) ? row.delivery_channel : null;
  const paused = flag(row.notify_paused);
  const linked = row.telegram_chat_id != null;
  const flags = channel
    ? notifyFlags({ channel, linked, paused })
    : {
        notifyEmail: flag(row.notify_email) && !paused,
        notifyBot: flag(row.notify_bot) && !paused && linked,
      };
  return {
    userId: row.user_id,
    source: row.source,
    streak: Number(row.streak) || 0,
    finishedAt: row.finished_at ? String(row.finished_at) : null,
    convertedAt: row.converted_at ? String(row.converted_at) : null,
    telegramChatId: row.telegram_chat_id == null ? null : String(row.telegram_chat_id),
    notifyEmail: flags.notifyEmail,
    notifyBot: flags.notifyBot,
    channel,
    introSeen: Boolean(row.intro_seen_at),
    notifyPaused: paused,
    email: row.email,
    displayName: row.display_name?.trim() || "",
  };
}

export async function getParticipant(
  marathonId: number,
  userId: number,
  getConnection?: Conn,
): Promise<Participant | null> {
  return withConn(async (connection) => {
    const rows = await connection.query<{
      user_id: number;
      source: string | null;
      streak: number;
      finished_at: unknown;
      converted_at: unknown;
      telegram_chat_id: number | string | null;
      notify_email: number;
      notify_bot: number;
      delivery_channel: string | null;
      intro_seen_at: unknown;
      notify_paused: number;
      email: string | null;
      display_name: string | null;
    }>(
      `SELECT p.user_id, p.source, p.streak, p.finished_at, p.converted_at,
              p.telegram_chat_id, p.notify_email, p.notify_bot, p.delivery_channel,
              p.intro_seen_at, p.notify_paused, u.email, u.display_name
       FROM marathon_participants p
       INNER JOIN app_users u ON u.id = p.user_id
       WHERE p.marathon_id = ? AND p.user_id = ? LIMIT 1`,
      [marathonId, userId],
    );
    const row = rows[0];
    if (!row) return null;
    return mapParticipant(row);
  }, getConnection);
}

export async function findParticipantByChat(
  chatId: string,
  getConnection?: Conn,
): Promise<{ marathon: DailyMarathon; participant: Participant } | null> {
  if (!/^[1-9][0-9]{0,19}$/.test(chatId)) return null;
  return withConn(async (connection) => {
    const rows = await connection.query<{ marathon_id: number }>(
      `SELECT p.marathon_id
       FROM marathon_participants p
       INNER JOIN marathons m ON m.id = p.marathon_id
       WHERE p.telegram_chat_id = ? AND m.kind = 'daily' AND m.status IN ('active', 'finished')
       ORDER BY (m.status = 'active') DESC, (p.delivery_channel = 'telegram') DESC, p.joined_at DESC
       LIMIT 1`,
      [chatId],
    );
    const id = rows[0]?.marathon_id;
    if (!id) return null;
    const marathonRows = await connection.query<Parameters<typeof mapMarathon>[0]>(
      `SELECT ${MARATHON_SELECT} FROM marathons WHERE id = ? AND kind = 'daily' LIMIT 1`,
      [id],
    );
    const marathon = marathonRows[0] ? mapMarathon(marathonRows[0]) : null;
    if (!marathon) return null;
    const people = await connection.query<Parameters<typeof mapParticipant>[0]>(
      `SELECT p.user_id, p.source, p.streak, p.finished_at, p.converted_at,
              p.telegram_chat_id, p.notify_email, p.notify_bot, p.delivery_channel,
              p.intro_seen_at, p.notify_paused, u.email, u.display_name
       FROM marathon_participants p
       INNER JOIN app_users u ON u.id = p.user_id
       WHERE p.marathon_id = ? AND p.telegram_chat_id = ?
       LIMIT 1`,
      [id, chatId],
    );
    const participant = people[0] ? mapParticipant(people[0]) : null;
    if (!participant) return null;
    return { marathon, participant };
  }, getConnection);
}

export async function joinParticipant(
  marathonId: number,
  userId: number,
  source: string | null,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `INSERT IGNORE INTO marathon_participants (marathon_id, user_id, source) VALUES (?, ?, ?)`,
      [marathonId, userId, source],
    );
    if (source) {
      await connection.execute(
        `UPDATE marathon_participants SET source = ?
         WHERE marathon_id = ? AND user_id = ? AND source IS NULL`,
        [source, marathonId, userId],
      );
    }
  }, getConnection);
}

export async function listProgress(
  marathonId: number,
  userId: number,
  getConnection?: Conn,
): Promise<DayProgress[]> {
  return withConn(async (connection) => {
    const rows = await connection.query<{
      day_id: number;
      day_number: number;
      materials_viewed_at: unknown;
      score: number | null;
      passed: number;
      completed_at: unknown;
      answers_json: string | null;
      correct_count: number | null;
    }>(
      `SELECT pr.day_id, d.day_number, pr.materials_viewed_at, pr.score, pr.passed,
              pr.completed_at, pr.answers_json, pr.correct_count
       FROM marathon_day_progress pr
       INNER JOIN marathon_days d ON d.id = pr.day_id
       WHERE pr.marathon_id = ? AND pr.user_id = ?
       ORDER BY d.day_number`,
      [marathonId, userId],
    );
    return rows.map((row) => ({
      dayId: row.day_id,
      dayNumber: row.day_number,
      materialsViewed: Boolean(row.materials_viewed_at),
      score: row.score == null ? null : Number(row.score),
      passed: flag(row.passed),
      completedAt: asMs(row.completed_at),
      answers: parseStoredAnswers(row.answers_json),
      correctCount: row.correct_count == null ? null : Number(row.correct_count),
    }));
  }, getConnection);
}

export async function markMaterialsViewed(input: {
  marathon: DailyMarathon;
  userId: number;
  day: MarathonDay;
  now: Date;
}, getConnection?: Conn): Promise<"ok" | "locked" | "missing"> {
  const access = evaluateDayAccess({
    now: input.now,
    startDate: input.marathon.startDate,
    unlockHour: input.marathon.unlockHour,
    daysCount: input.marathon.daysCount,
    dayNumber: input.day.dayNumber,
  });
  if (!access.open) return access.code === "locked" ? "locked" : "missing";
  await withConn(async (connection) => {
    await connection.execute(
      `INSERT INTO marathon_day_progress (marathon_id, user_id, day_id, materials_viewed_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         materials_viewed_at = COALESCE(materials_viewed_at, VALUES(materials_viewed_at))`,
      [input.marathon.id, input.userId, input.day.id, input.now],
    );
  }, getConnection);
  return "ok";
}

export type RankStanding = {
  place: number;
  prevPlace: number | null;
  points: number;
};

export type DayCompletion =
  | { ok: false; code: "invalid_day" | "locked" | "materials_required" }
  | (SubmitSuccess & { fresh: boolean; correct: number; rank: RankStanding | null });

export async function completeParticipantDay(input: {
  marathon: DailyMarathon;
  userId: number;
  day: MarathonDay;
  answers: Record<number, number>;
  materialsViewed: boolean;
  progress: ProgressMark[];
  now: Date;
}, getConnection?: Conn): Promise<DayCompletion> {
  return withConn(async (connection) => {
    const existing = await connection.query<{
      completed_at: unknown;
      score: number | null;
      passed: number;
      streak: number;
    }>(
      `SELECT pr.completed_at, pr.score, pr.passed, p.streak
       FROM marathon_day_progress pr
       INNER JOIN marathon_participants p
         ON p.marathon_id = pr.marathon_id AND p.user_id = pr.user_id
       WHERE pr.marathon_id = ? AND pr.user_id = ? AND pr.day_id = ?
       LIMIT 1`,
      [input.marathon.id, input.userId, input.day.id],
    );
    const prior = existing[0];
    if (prior?.completed_at) {
      return {
        ok: true,
        score: prior.score == null ? 0 : Number(prior.score),
        passed: flag(prior.passed),
        streak: Number(prior.streak) || 0,
        completedAt: asMs(prior.completed_at) ?? input.now.getTime(),
        fresh: false,
        correct: 0,
        rank: null,
      };
    }
    let dayCorrect = 0;
    const rows = await loadReviewRows(connection, input.day.id);
    const tasks = rows.flatMap((row) => {
      const task = projectReviewedTask(row, {});
      return task ? [task] : [];
    });
    const submitted = await submitOpenedDay(
      {
        startDate: input.marathon.startDate,
        unlockHour: input.marathon.unlockHour,
        daysCount: input.marathon.daysCount,
        dayNumber: input.day.dayNumber,
        materialsViewed: input.materialsViewed,
        passThreshold: input.marathon.passThreshold,
        progress: input.progress,
      },
      {
        now: () => input.now,
        grade: () => {
          let correct = 0;
          for (const task of tasks) {
            if (input.answers[task.id] === task.correct) correct += 1;
          }
          dayCorrect = correct;
          return { correct, total: tasks.length };
        },
        persist: async (result) => {
          await connection.execute(
            `INSERT INTO marathon_day_progress
              (marathon_id, user_id, day_id, materials_viewed_at, score, passed, completed_at, answers_json, correct_count)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               score = VALUES(score),
               passed = VALUES(passed),
               completed_at = VALUES(completed_at),
               answers_json = VALUES(answers_json),
               correct_count = VALUES(correct_count),
               materials_viewed_at = COALESCE(materials_viewed_at, VALUES(materials_viewed_at))`,
            [
              input.marathon.id,
              input.userId,
              input.day.id,
              input.now,
              result.score,
              result.passed ? 1 : 0,
              input.now,
              JSON.stringify(input.answers),
              dayCorrect,
            ],
          );
          const done = new Set(
            input.progress
              .filter((row) => row.completedAt != null)
              .map((row) => row.dayNumber),
          );
          done.add(input.day.dayNumber);
          const finished = done.size >= input.marathon.daysCount;
          await connection.execute(
            `UPDATE marathon_participants
             SET streak = ?,
                 finished_at = CASE
                   WHEN ? = 1 THEN COALESCE(finished_at, ?)
                   ELSE finished_at
                 END
             WHERE marathon_id = ? AND user_id = ?`,
            [
              result.streak,
              finished ? 1 : 0,
              input.now,
              input.marathon.id,
              input.userId,
            ],
          );
        },
      },
    );
    if (!submitted.ok) return submitted;
    const board = await composeBoard(connection, input.marathon.id, true);
    const self = board.find((row) => row.userId === input.userId) ?? null;
    return {
      ...submitted,
      fresh: true,
      correct: dayCorrect,
      rank: self
        ? { place: self.place, prevPlace: self.prevPlace, points: self.points }
        : null,
    };
  }, getConnection);
}

export async function savePartialAnswers(input: {
  marathonId: number;
  userId: number;
  dayId: number;
  answers: Record<number, number>;
  now: Date;
}, getConnection?: Conn): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `INSERT INTO marathon_day_progress
        (marathon_id, user_id, day_id, materials_viewed_at, answers_json)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         materials_viewed_at = COALESCE(materials_viewed_at, VALUES(materials_viewed_at)),
         answers_json = IF(completed_at IS NULL, VALUES(answers_json), answers_json)`,
      [
        input.marathonId,
        input.userId,
        input.dayId,
        input.now,
        JSON.stringify(input.answers),
      ],
    );
  }, getConnection);
}

export async function setDeliveryChannel(
  marathonId: number,
  userId: number,
  channel: "site" | "telegram",
  linked: boolean,
  getConnection?: Conn,
): Promise<void> {
  const flags = notifyFlags({ channel, linked, paused: false });
  await withConn(async (connection) => {
    await connection.execute(
      `UPDATE marathon_participants
       SET delivery_channel = ?, notify_email = ?, notify_bot = ?, notify_paused = 0
       WHERE marathon_id = ? AND user_id = ?`,
      [channel, flags.notifyEmail ? 1 : 0, flags.notifyBot ? 1 : 0, marathonId, userId],
    );
  }, getConnection);
}

export async function markIntroSeen(
  marathonId: number,
  userId: number,
  now: Date,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `UPDATE marathon_participants
       SET intro_seen_at = COALESCE(intro_seen_at, ?)
       WHERE marathon_id = ? AND user_id = ?`,
      [now, marathonId, userId],
    );
  }, getConnection);
}

export async function pauseMarathonNotifications(
  marathonId: number,
  userId: number,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `UPDATE marathon_participants
       SET notify_paused = 1, notify_email = 0, notify_bot = 0
       WHERE marathon_id = ? AND user_id = ?`,
      [marathonId, userId],
    );
  }, getConnection);
}

export async function loadMarathonCopy(
  marathonId: number,
  getConnection?: Conn,
): Promise<Partial<Record<CopyKey, string>>> {
  return withConn(async (connection) => readCopy(connection, marathonId), getConnection);
}

export async function saveMarathonCopy(
  marathonId: number,
  key: CopyKey,
  body: string,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `INSERT INTO marathon_copy (marathon_id, copy_key, body) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE body = VALUES(body)`,
      [marathonId, key, body],
    );
  }, getConnection);
}

export async function resetMarathonCopy(
  marathonId: number,
  key: CopyKey,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `DELETE FROM marathon_copy WHERE marathon_id = ? AND copy_key = ?`,
      [marathonId, key],
    );
  }, getConnection);
}

async function readCopy(
  connection: SqlConnection,
  marathonId: number,
): Promise<Partial<Record<CopyKey, string>>> {
  const rows = await connection.query<{ copy_key: string; body: string }>(
    `SELECT copy_key, body FROM marathon_copy WHERE marathon_id = ?`,
    [marathonId],
  );
  const copy: Partial<Record<CopyKey, string>> = {};
  for (const row of rows) {
    if (isCopyKey(row.copy_key) && row.body.trim()) copy[row.copy_key] = row.body;
  }
  return copy;
}

export async function setNotifyPrefs(
  marathonId: number,
  userId: number,
  prefs: { notifyEmail: boolean; notifyBot: boolean },
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `UPDATE marathon_participants
       SET notify_email = ?, notify_bot = ?
       WHERE marathon_id = ? AND user_id = ?`,
      [prefs.notifyEmail ? 1 : 0, prefs.notifyBot ? 1 : 0, marathonId, userId],
    );
  }, getConnection);
}

export async function silenceEmail(
  marathonId: number,
  userId: number,
  getConnection?: Conn,
): Promise<boolean> {
  return withConn(async (connection) => {
    const result = await connection.execute(
      `UPDATE marathon_participants SET notify_email = 0
       WHERE marathon_id = ? AND user_id = ?`,
      [marathonId, userId],
    );
    return result.affectedRows > 0;
  }, getConnection);
}

export async function markConverted(
  marathonId: number,
  userId: number,
  now: Date,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `UPDATE marathon_participants
       SET converted_at = COALESCE(converted_at, ?)
       WHERE marathon_id = ? AND user_id = ?`,
      [now, marathonId, userId],
    );
    await connection.execute(
      `UPDATE app_users
       SET cabinet_scope = 'full'
       WHERE id = ? AND cabinet_scope = 'marathon'`,
      [userId],
    );
  }, getConnection);
}

export async function listParticipantReports(
  marathonId: number,
  getConnection?: Conn,
): Promise<ParticipantReport[]> {
  return withConn(async (connection) => {
    const rows = await connection.query<{
      user_id: number;
      display_name: string;
      login: string;
      email: string | null;
      email_verified_at: unknown;
      source: string | null;
      streak: number;
      finished_at: unknown;
      converted_at: unknown;
      day_number: number | null;
      score: number | null;
      passed: number | null;
      completed_at: unknown;
    }>(
      `SELECT u.id AS user_id, u.display_name, u.login, u.email, u.email_verified_at,
              p.source, p.streak, p.finished_at, p.converted_at,
              d.day_number, pr.score, pr.passed, pr.completed_at
       FROM marathon_participants p
       INNER JOIN app_users u ON u.id = p.user_id
       LEFT JOIN marathon_days d ON d.marathon_id = p.marathon_id
       LEFT JOIN marathon_day_progress pr
         ON pr.marathon_id = p.marathon_id AND pr.user_id = p.user_id AND pr.day_id = d.id
       WHERE p.marathon_id = ?
       ORDER BY u.display_name, d.day_number`,
      [marathonId],
    );
    const byUser = new Map<number, ParticipantReport>();
    for (const row of rows) {
      let report = byUser.get(row.user_id);
      if (!report) {
        report = {
          userId: row.user_id,
          displayName: row.display_name,
          login: row.login,
          email: row.email,
          emailVerified: Boolean(row.email_verified_at),
          source: row.source,
          streak: Number(row.streak) || 0,
          finished: Boolean(row.finished_at),
          converted: Boolean(row.converted_at),
          days: [],
        };
        byUser.set(row.user_id, report);
      }
      if (row.day_number != null) {
        report.days.push({
          dayNumber: row.day_number,
          score: row.score == null ? null : Number(row.score),
          passed: flag(row.passed),
          completed: Boolean(row.completed_at),
        });
      }
    }
    return [...byUser.values()];
  }, getConnection);
}

export type NotifyAudienceMarathon = {
  marathonId: number;
  slug: string;
  title: string;
  startDate: string;
  unlockHour: string;
  daysCount: number;
  topics: Record<number, string>;
  copy: Partial<Record<CopyKey, string>>;
  people: Array<{
    userId: number;
    email: string | null;
    displayName: string;
    telegramChatId: string | null;
    notifyEmail: boolean;
    notifyBot: boolean;
    completedDayNumbers: number[];
  }>;
};

export async function loadNotifyAudience(
  getConnection?: Conn,
): Promise<NotifyAudienceMarathon[]> {
  return withConn(async (connection) => {
    const rows = await connection.query<{
      marathon_id: number;
      slug: string;
      title: string;
      start_date: unknown;
      unlock_hour: string;
      days_count: number;
      day_number: number | null;
      topic: string | null;
      user_id: number;
      email: string | null;
      display_name: string | null;
      telegram_chat_id: number | string | null;
      notify_email: number;
      notify_bot: number;
      delivery_channel: string | null;
      notify_paused: number;
      completed_at: unknown;
      is_banned: number;
    }>(
      `SELECT m.id AS marathon_id, m.slug, m.title, m.start_date, m.unlock_hour, m.days_count,
              d.day_number, d.topic,
              p.user_id, u.email, u.display_name, p.telegram_chat_id, p.notify_email, p.notify_bot,
              p.delivery_channel, p.notify_paused, pr.completed_at, u.is_banned
       FROM marathons m
       INNER JOIN marathon_participants p ON p.marathon_id = m.id
       INNER JOIN app_users u ON u.id = p.user_id
       LEFT JOIN marathon_days d ON d.marathon_id = m.id
       LEFT JOIN marathon_day_progress pr
         ON pr.marathon_id = m.id AND pr.user_id = p.user_id AND pr.day_id = d.id
       WHERE m.kind = 'daily' AND m.status = 'active'`,
      [],
    );
    const grouped = new Map<number, NotifyAudienceMarathon>();
    const people = new Map<string, NotifyAudienceMarathon["people"][number]>();
    for (const row of rows) {
      if (flag(row.is_banned)) continue;
      let marathon = grouped.get(row.marathon_id);
      if (!marathon) {
        const startDate = isoDate(row.start_date);
        if (!startDate) continue;
        marathon = {
          marathonId: row.marathon_id,
          slug: row.slug,
          title: row.title,
          startDate,
          unlockHour: String(row.unlock_hour).slice(0, 5),
          daysCount: Number(row.days_count),
          topics: {},
          copy: {},
          people: [],
        };
        grouped.set(row.marathon_id, marathon);
      }
      if (row.day_number != null && row.topic) {
        marathon.topics[row.day_number] = row.topic;
      }
      const personKey = `${row.marathon_id}:${row.user_id}`;
      let person = people.get(personKey);
      if (!person) {
        const channel = isDeliveryChannel(row.delivery_channel) ? row.delivery_channel : null;
        const paused = flag(row.notify_paused);
        const linked = row.telegram_chat_id != null;
        const flags = channel
          ? notifyFlags({ channel, linked, paused })
          : {
              notifyEmail: flag(row.notify_email) && !paused,
              notifyBot: flag(row.notify_bot) && !paused && linked,
            };
        person = {
          userId: row.user_id,
          email: row.email,
          displayName: row.display_name?.trim() || "",
          telegramChatId:
            row.telegram_chat_id == null ? null : String(row.telegram_chat_id),
          notifyEmail: flags.notifyEmail,
          notifyBot: flags.notifyBot,
          completedDayNumbers: [],
        };
        people.set(personKey, person);
        marathon.people.push(person);
      }
      if (row.day_number != null && row.completed_at) {
        person.completedDayNumbers.push(row.day_number);
      }
    }
    const ids = [...grouped.keys()];
    if (ids.length > 0) {
      const copies = await connection.query<{
        marathon_id: number;
        copy_key: string;
        body: string;
      }>(
        `SELECT marathon_id, copy_key, body FROM marathon_copy
         WHERE marathon_id IN (${ids.map(() => "?").join(",")})`,
        ids,
      );
      for (const row of copies) {
        const marathon = grouped.get(row.marathon_id);
        if (marathon && isCopyKey(row.copy_key) && row.body.trim()) {
          marathon.copy[row.copy_key] = row.body;
        }
      }
    }
    return [...grouped.values()];
  }, getConnection);
}

export async function loadMarathonBoard(
  marathonId: number,
  getConnection?: Conn,
): Promise<BoardLine[]> {
  return withConn(
    (connection) => composeBoard(connection, marathonId, false),
    getConnection,
  );
}

async function composeBoard(
  connection: SqlConnection,
  marathonId: number,
  write: boolean,
): Promise<BoardLine[]> {
  await backfillCorrectCounts(connection, marathonId);
  const standings = await readStandings(connection, marathonId);
  const previous = await readPrevPlaces(connection, marathonId);
  const ranked = applyRankSnapshot(previous, rankParticipants(standings));
  if (write) await saveRanks(connection, marathonId, ranked);
  return ranked.map((row) => ({
    userId: row.userId,
    place: row.place,
    prevPlace: row.prevPlace,
    points: row.points,
    streak: row.streak,
    name: publicLeaderName(row.displayName),
  }));
}

async function backfillCorrectCounts(
  connection: SqlConnection,
  marathonId: number,
): Promise<void> {
  const missing = await connection.query<{
    user_id: number;
    day_id: number;
    answers_json: string | null;
  }>(
    `SELECT user_id, day_id, answers_json
     FROM marathon_day_progress
     WHERE marathon_id = ? AND completed_at IS NOT NULL AND correct_count IS NULL`,
    [marathonId],
  );
  if (missing.length === 0) return;
  const keys = await connection.query<{
    day_id: number;
    id: number;
    inline_correct: number | null;
    right_answer_n: number | null;
  }>(
    `SELECT t.day_id, t.id, t.inline_correct, q.right_answer_n
     FROM marathon_day_tasks t
     INNER JOIN marathon_days d ON d.id = t.day_id
     LEFT JOIN quiz_tasks q ON q.id = t.question_id
     WHERE d.marathon_id = ?`,
    [marathonId],
  );
  const byDay = new Map<number, Array<{ id: number; correct: number }>>();
  for (const key of keys) {
    const list = byDay.get(key.day_id) ?? [];
    list.push({
      id: key.id,
      correct: Number(key.inline_correct ?? key.right_answer_n ?? 0) || 0,
    });
    byDay.set(key.day_id, list);
  }
  for (const row of missing) {
    const answers = parseStoredAnswers(row.answers_json);
    let correct = 0;
    for (const task of byDay.get(row.day_id) ?? []) {
      if (answers[task.id] === task.correct) correct += 1;
    }
    await connection.execute(
      `UPDATE marathon_day_progress
       SET correct_count = ?
       WHERE marathon_id = ? AND user_id = ? AND day_id = ? AND correct_count IS NULL`,
      [correct, marathonId, row.user_id, row.day_id],
    );
  }
}

async function readStandings(
  connection: SqlConnection,
  marathonId: number,
): Promise<RankInput[]> {
  const rows = await connection.query<{
    user_id: number;
    display_name: string | null;
    streak: number;
    joined_at: unknown;
    points: number | string | null;
    last_completed: unknown;
  }>(
    `SELECT p.user_id AS user_id,
            u.display_name AS display_name,
            p.streak AS streak,
            p.joined_at AS joined_at,
            COALESCE(SUM(CASE WHEN pr.completed_at IS NOT NULL THEN pr.correct_count ELSE 0 END), 0) AS points,
            MAX(CASE WHEN pr.completed_at IS NOT NULL THEN pr.completed_at ELSE NULL END) AS last_completed
     FROM marathon_participants p
     INNER JOIN app_users u ON u.id = p.user_id
     LEFT JOIN marathon_day_progress pr
       ON pr.marathon_id = p.marathon_id AND pr.user_id = p.user_id
     WHERE p.marathon_id = ? AND u.is_banned = 0
     GROUP BY p.user_id, u.display_name, p.streak, p.joined_at`,
    [marathonId],
  );
  return rows.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name?.trim() || "",
    points: Number(row.points) || 0,
    lastCompletedAt: asMs(row.last_completed),
    streak: Number(row.streak) || 0,
    joinedAt: asMs(row.joined_at) ?? 0,
  }));
}

async function readPrevPlaces(
  connection: SqlConnection,
  marathonId: number,
): Promise<Map<number, number>> {
  const rows = await connection.query<{ user_id: number; place: number }>(
    `SELECT user_id, place FROM marathon_ranks WHERE marathon_id = ?`,
    [marathonId],
  );
  return new Map(rows.map((row) => [row.user_id, Number(row.place)]));
}

async function saveRanks(
  connection: SqlConnection,
  marathonId: number,
  ranked: Array<{ userId: number; place: number; prevPlace: number | null; points: number }>,
): Promise<void> {
  const now = new Date();
  for (const row of ranked) {
    await connection.execute(
      `INSERT INTO marathon_ranks (marathon_id, user_id, place, prev_place, points, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         place = VALUES(place),
         prev_place = VALUES(prev_place),
         points = VALUES(points),
         updated_at = VALUES(updated_at)`,
      [marathonId, row.userId, row.place, row.prevPlace, row.points, now],
    );
  }
  if (ranked.length === 0) {
    await connection.execute(`DELETE FROM marathon_ranks WHERE marathon_id = ?`, [marathonId]);
    return;
  }
  const ids = ranked.map((row) => row.userId);
  await connection.execute(
    `DELETE FROM marathon_ranks
     WHERE marathon_id = ? AND user_id NOT IN (${ids.map(() => "?").join(",")})`,
    [marathonId, ...ids],
  );
}

export async function claimNotification(
  intent: Pick<NotifyIntent, "marathonId" | "userId" | "dayNumber" | "kind" | "channel"> & {
    kind: NotifyKind;
  },
  getConnection?: Conn,
): Promise<"claimed" | "duplicate"> {
  return withConn(async (connection) => {
    try {
      await connection.execute(
        `INSERT INTO marathon_notifications
          (marathon_id, user_id, day_number, kind, channel)
         VALUES (?, ?, ?, ?, ?)`,
        [intent.marathonId, intent.userId, intent.dayNumber, intent.kind, intent.channel],
      );
      return "claimed";
    } catch (error) {
      const errno = (error as { errno?: number }).errno;
      if (errno === 1062) return "duplicate";
      throw error;
    }
  }, getConnection);
}

export async function releaseNotification(
  intent: Pick<NotifyIntent, "marathonId" | "userId" | "dayNumber" | "kind" | "channel"> & {
    kind: NotifyKind;
  },
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `DELETE FROM marathon_notifications
       WHERE marathon_id = ? AND user_id = ? AND day_number = ? AND kind = ? AND channel = ?`,
      [intent.marathonId, intent.userId, intent.dayNumber, intent.kind, intent.channel],
    );
  }, getConnection);
}

/** Map of the latest joined daily marathon (active first, then finished). */
export async function getStudentMarathonHref(
  userId: number,
  getConnection?: Conn,
): Promise<string | null> {
  return withConn(async (connection) => {
    const rows = await connection.query<{ slug: string }>(
      `SELECT m.slug
       FROM marathon_participants p
       INNER JOIN marathons m ON m.id = p.marathon_id
       WHERE p.user_id = ? AND m.kind = 'daily' AND m.status IN ('active', 'finished')
       ORDER BY (m.status = 'active') DESC, p.joined_at DESC
       LIMIT 1`,
      [userId],
    );
    const slug = rows[0]?.slug;
    return slug ? `/marathon/${slug}/map` : null;
  }, getConnection);
}

export async function saveMarathonBotTokens(
  rows: Array<{ token: string; marathonId: number; userId: number; payload: string }>,
  getConnection?: Conn,
): Promise<void> {
  if (rows.length === 0) return;
  await withConn(async (connection) => {
    for (const row of rows) {
      await connection.execute(
        `INSERT INTO marathon_bot_tokens (token, marathon_id, user_id, payload)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE payload = VALUES(payload)`,
        [row.token, row.marathonId, row.userId, row.payload.slice(0, 240)],
      );
    }
  }, getConnection);
}

export async function readMarathonBotToken(
  token: string,
  marathonId: number,
  userId: number,
  getConnection?: Conn,
): Promise<string | null> {
  return withConn(async (connection) => {
    const rows = await connection.query<{ payload: string }>(
      `SELECT payload FROM marathon_bot_tokens
       WHERE token = ? AND marathon_id = ? AND user_id = ?`,
      [token, marathonId, userId],
    );
    return rows[0]?.payload ?? null;
  }, getConnection);
}

export type TelegramOutboxRow = {
  id: number;
  chatId: string;
  payload: string;
  attempts: number;
};

export async function enqueueMarathonTelegram(
  jobs: Array<{ chatId: string; payload: string }>,
  getConnection?: Conn,
): Promise<void> {
  if (jobs.length === 0) return;
  await withConn(async (connection) => {
    for (const job of jobs) {
      await connection.execute(
        `INSERT INTO marathon_telegram_outbox (chat_id, payload) VALUES (?, ?)`,
        [job.chatId, job.payload],
      );
    }
  }, getConnection);
}

export async function claimMarathonTelegram(
  limit: number,
  getConnection?: Conn,
): Promise<TelegramOutboxRow[]> {
  return withConn(async (connection) => {
    const size = Math.min(30, Math.max(1, Math.floor(limit)));
    const rows = await connection.query<{
      id: number;
      chat_id: string;
      payload: string;
      attempts: number;
    }>(
      `SELECT id, chat_id, payload, attempts
       FROM marathon_telegram_outbox
       WHERE status = 'pending' AND (not_before IS NULL OR not_before <= CURRENT_TIMESTAMP)
       ORDER BY id
       LIMIT ${size}`,
      [],
    );
    const claimed: TelegramOutboxRow[] = [];
    for (const row of rows) {
      const result = await connection.execute(
        `UPDATE marathon_telegram_outbox
         SET not_before = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 2 MINUTE), attempts = attempts + 1
         WHERE id = ? AND status = 'pending'`,
        [row.id],
      );
      if (result.affectedRows === 1) {
        claimed.push({
          id: row.id,
          chatId: String(row.chat_id),
          payload: row.payload,
          attempts: Number(row.attempts) + 1,
        });
      }
    }
    return claimed;
  }, getConnection);
}

export async function finishMarathonTelegram(
  id: number,
  status: "sent" | "failed" | "pending",
  notBefore: Date | null,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `UPDATE marathon_telegram_outbox
       SET status = ?, not_before = ?
       WHERE id = ?`,
      [status, notBefore, id],
    );
  }, getConnection);
}
