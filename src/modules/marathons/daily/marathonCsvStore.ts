import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { publishedQuizTaskSql } from "@/lib/publishedQuizTask";
import { dayUnlockAt } from "./calendar";
import { DAY_HAS_ANSWERS_SQL } from "./dayRemoval";
import { isDuplicateKey } from "./forms";
import {
  importNotes,
  missingQuestionIssues,
  parseMarathonCsv,
  questionIdsOf,
  type CsvIssue,
  type MarathonCsvDocument,
} from "./marathonCsv";
import { deleteOrphanTaggedRiddles } from "./riddleStore";
import { invalidateMarathonHomeCache } from "./store/cache";
import { MARATHON_SELECT, mapMarathon, withConn, type Conn } from "./store/db";

export type CsvPreview = {
  mode: "create" | "update";
  marathonId: number | null;
  slug: string;
  title: string;
  days: number;
  tasks: number;
  materials: number;
  riddles: number;
  notes: string[];
};

export type CsvCheck =
  | { ok: true; document: MarathonCsvDocument; preview: CsvPreview }
  | { ok: false; errors: CsvIssue[] };

function bounds(input: { startDate: string; unlockHour: string; daysCount: number }) {
  return {
    startsAt: Math.floor(dayUnlockAt({ ...input, dayNumber: 1 }).getTime() / 1000),
    endsAt: Math.floor(dayUnlockAt({ ...input, dayNumber: input.daysCount + 1 }).getTime() / 1000),
  };
}

async function publishedIds(connection: SqlConnection, ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const rows = await connection.query<{ id: number }>(
    `SELECT id FROM quiz_tasks WHERE id IN (${ids.map(() => "?").join(", ")}) AND ${publishedQuizTaskSql()}`,
    ids,
  );
  return new Set(rows.map((row) => Number(row.id)));
}

async function answerCount(connection: SqlConnection, marathonId: number): Promise<number> {
  const rows = await connection.query<{ n: number | string }>(
    `SELECT COUNT(*) AS n FROM marathon_day_progress
     WHERE marathon_id = ? AND ${DAY_HAS_ANSWERS_SQL}`,
    [marathonId],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function checkMarathonCsv(text: string, getConnection?: Conn): Promise<CsvCheck> {
  const parsed = parseMarathonCsv(text);
  if (!parsed.ok) return parsed;
  return withConn(async (connection) => {
    const document = parsed.document;
    const missing = missingQuestionIssues(
      document,
      await publishedIds(connection, questionIdsOf(document)),
    );
    if (missing.length > 0) return { ok: false, errors: missing };
    const found = await connection.query<Parameters<typeof mapMarathon>[0]>(
      `SELECT ${MARATHON_SELECT} FROM marathons WHERE slug = ? AND kind = 'daily' LIMIT 1`,
      [document.marathon.slug],
    );
    const existing = found[0] ? mapMarathon(found[0], { requireStart: false }) : null;
    if (existing) {
      const answers = await answerCount(connection, existing.id);
      if (answers > 0) {
        return {
          ok: false,
          errors: [{
            row: document.marathon.row,
            message: `У марафоні «${existing.slug}» вже є відповіді учнів (${answers}). Імпорт зупинено, нічого не змінено.`,
          }],
        };
      }
    }
    const tasks = document.days.reduce((sum, day) => sum + day.tasks.length, 0);
    const materials = document.days.reduce((sum, day) => sum + day.materials.length, 0);
    return {
      ok: true,
      document,
      preview: {
        mode: existing ? "update" : "create",
        marathonId: existing?.id ?? null,
        slug: document.marathon.slug,
        title: document.marathon.title,
        days: document.days.length,
        tasks,
        materials,
        riddles: document.riddles.length,
        notes: importNotes(existing ? "update" : "create", document.marathon.status),
      },
    };
  }, getConnection);
}

async function writeStructure(
  connection: SqlConnection,
  marathonId: number,
  document: MarathonCsvDocument,
): Promise<void> {
  await connection.execute(
    `DELETE FROM marathon_images WHERE marathon_id = ? AND day_id <> 0`,
    [marathonId],
  );
  await connection.execute(
    `DELETE t FROM marathon_day_tasks t
     INNER JOIN marathon_days d ON d.id = t.day_id
     WHERE d.marathon_id = ?`,
    [marathonId],
  );
  await connection.execute(
    `DELETE m FROM marathon_day_materials m
     INNER JOIN marathon_days d ON d.id = m.day_id
     WHERE d.marathon_id = ?`,
    [marathonId],
  );
  await connection.execute(
    `DELETE pr FROM marathon_day_progress pr
     INNER JOIN marathon_days d ON d.id = pr.day_id
     WHERE d.marathon_id = ?`,
    [marathonId],
  );
  await connection.execute(`DELETE FROM marathon_days WHERE marathon_id = ?`, [marathonId]);
  for (const day of document.days) {
    const inserted = await connection.execute(
      `INSERT INTO marathon_days (marathon_id, day_number, topic, intro_text) VALUES (?, ?, ?, ?)`,
      [marathonId, day.dayNumber, day.topic, day.introText || null],
    );
    for (const material of day.materials) {
      await connection.execute(
        `INSERT INTO marathon_day_materials (day_id, sort_order, material_type, url_or_body)
         VALUES (?, ?, ?, ?)`,
        [inserted.insertId, material.order, material.type, material.body],
      );
    }
    for (const task of day.tasks) {
      await connection.execute(
        `INSERT INTO marathon_day_tasks
          (day_id, sort_order, question_id, inline_prompt, inline_options, inline_correct, inline_explanation)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          inserted.insertId,
          task.order,
          task.questionId,
          task.prompt,
          task.options ? JSON.stringify(task.options) : null,
          task.correct,
          task.explanation,
        ],
      );
    }
  }
  await connection.execute(`DELETE FROM riddle_marathon_tags WHERE marathon_id = ?`, [marathonId]);
  await deleteOrphanTaggedRiddles(connection);
  for (const riddle of document.riddles) {
    const created = await connection.execute(
      `INSERT INTO riddle_bank (subject, visibility, title, body, hint) VALUES (?, 'tagged', ?, ?, ?)`,
      [riddle.subject, riddle.title, riddle.body, riddle.hint],
    );
    for (let index = 0; index < riddle.options.length; index += 1) {
      await connection.execute(
        `INSERT INTO riddle_options (riddle_id, sort_order, label, is_correct) VALUES (?, ?, ?, ?)`,
        [created.insertId, index + 1, riddle.options[index], index + 1 === riddle.correct ? 1 : 0],
      );
    }
    await connection.execute(
      `INSERT INTO riddle_marathon_tags (riddle_id, marathon_id) VALUES (?, ?)`,
      [created.insertId, marathonId],
    );
  }
}

export async function applyMarathonCsv(
  text: string,
  getConnection?: Conn,
): Promise<{ ok: true; id: number } | { ok: false; errors: CsvIssue[] }> {
  const checked = await checkMarathonCsv(text, getConnection);
  if (!checked.ok) return checked;
  const { document } = checked;
  const meta = document.marathon;
  const clock = bounds(meta);
  try {
    const written = await withConn(async (connection) => {
      await connection.beginTransaction();
      try {
        const found = await connection.query<{ id: number }>(
          `SELECT id FROM marathons WHERE slug = ? AND kind = 'daily' LIMIT 1 FOR UPDATE`,
          [meta.slug],
        );
        let marathonId = Number(found[0]?.id ?? 0);
        if (marathonId > 0) {
          const answers = await answerCount(connection, marathonId);
          if (answers > 0) {
            await connection.rollback();
            return { blocked: answers, id: marathonId };
          }
          await connection.execute(
            `UPDATE marathons
             SET title = ?, description = ?, subject = ?, start_date = ?, unlock_hour = ?,
                 reminder_hour = ?, nudge_from = ?, nudge_until = ?, days_count = ?,
                 pass_threshold = ?, final_cta_text = ?, final_cta_url = ?, intro_video_url = ?,
                 invite_audience = ?, landing_riddle_count = ?, public_chat_url = ?,
                 starts_at = ?, ends_at = ?
             WHERE id = ? AND kind = 'daily'`,
            [
              meta.title,
              meta.description,
              meta.subject,
              meta.startDate,
              meta.unlockHour,
              meta.reminderHour,
              meta.nudgeFrom,
              meta.nudgeUntil,
              meta.daysCount,
              meta.passThreshold,
              meta.finalCtaText,
              meta.finalCtaUrl,
              meta.introVideoUrl || null,
              meta.inviteAudience,
              meta.landingRiddleCount,
              meta.publicChatUrl || null,
              clock.startsAt,
              clock.endsAt,
              marathonId,
            ],
          );
        } else {
          const created = await connection.execute(
            `INSERT INTO marathons
              (slug, title, description, status, starts_at, ends_at, min_tasks_per_session,
               kind, subject, start_date, unlock_hour, reminder_hour, nudge_from, nudge_until,
               days_count, pass_threshold, final_cta_text, final_cta_url, intro_video_url,
               invite_audience, landing_riddle_count, public_chat_url)
             VALUES (?, ?, ?, 'draft', ?, ?, 5, 'daily', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              meta.slug,
              meta.title,
              meta.description,
              clock.startsAt,
              clock.endsAt,
              meta.subject,
              meta.startDate,
              meta.unlockHour,
              meta.reminderHour,
              meta.nudgeFrom,
              meta.nudgeUntil,
              meta.daysCount,
              meta.passThreshold,
              meta.finalCtaText,
              meta.finalCtaUrl,
              meta.introVideoUrl || null,
              meta.inviteAudience,
              meta.landingRiddleCount,
              meta.publicChatUrl || null,
            ],
          );
          marathonId = created.insertId;
        }
        const missing = missingQuestionIssues(
          document,
          await publishedIds(connection, questionIdsOf(document)),
        );
        if (missing.length > 0) {
          await connection.rollback();
          return { blocked: 0, id: 0, errors: missing };
        }
        await writeStructure(connection, marathonId, document);
        await connection.commit();
        return { blocked: 0, id: marathonId };
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }, getConnection);
    if (written.errors) return { ok: false, errors: written.errors };
    if (written.blocked > 0) {
      return {
        ok: false,
        errors: [{
          row: meta.row,
          message: `У марафоні «${meta.slug}» вже є відповіді учнів (${written.blocked}). Імпорт зупинено, нічого не змінено.`,
        }],
      };
    }
    invalidateMarathonHomeCache();
    return { ok: true, id: written.id };
  } catch (error) {
    if (isDuplicateKey(error)) {
      return {
        ok: false,
        errors: [{ row: meta.row, message: "Марафон з такою адресою вже є." }],
      };
    }
    throw error;
  }
}

function parseStoredOptions(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
}

export async function exportMarathonCsv(marathonId: number, getConnection?: Conn): Promise<string | null> {
  const { documentToCsv } = await import("./marathonCsv");
  return withConn(async (connection) => {
    const rows = await connection.query<Parameters<typeof mapMarathon>[0]>(
      `SELECT ${MARATHON_SELECT} FROM marathons WHERE id = ? AND kind = 'daily' LIMIT 1`,
      [marathonId],
    );
    const marathon = rows[0] ? mapMarathon(rows[0], { requireStart: false }) : null;
    if (!marathon) return null;
    const days = await connection.query<{
      id: number;
      day_number: number;
      topic: string;
      intro_text: string | null;
    }>(
      `SELECT id, day_number, topic, intro_text FROM marathon_days
       WHERE marathon_id = ? ORDER BY day_number`,
      [marathonId],
    );
    const dayIds = days.map((day) => Number(day.id));
    const materials = dayIds.length === 0
      ? []
      : await connection.query<{
          day_id: number;
          sort_order: number;
          material_type: "text" | "youtube" | "loom";
          url_or_body: string;
        }>(
          `SELECT day_id, sort_order, material_type, url_or_body
           FROM marathon_day_materials
           WHERE day_id IN (${dayIds.map(() => "?").join(", ")})
           ORDER BY sort_order, id`,
          dayIds,
        );
    const tasks = dayIds.length === 0
      ? []
      : await connection.query<{
          day_id: number;
          sort_order: number;
          question_id: number | null;
          inline_prompt: string | null;
          inline_options: string | null;
          inline_correct: number | null;
          inline_explanation: string | null;
        }>(
          `SELECT day_id, sort_order, question_id, inline_prompt, inline_options, inline_correct, inline_explanation
           FROM marathon_day_tasks
           WHERE day_id IN (${dayIds.map(() => "?").join(", ")})
           ORDER BY sort_order, id`,
          dayIds,
        );
    const riddleRows = await connection.query<{
      id: number;
      subject: string | null;
      title: string;
      body: string;
      hint: string | null;
    }>(
      `SELECT b.id, b.subject, b.title, b.body, b.hint
       FROM riddle_bank b
       INNER JOIN riddle_marathon_tags tag ON tag.riddle_id = b.id AND tag.marathon_id = ?
       WHERE b.visibility = 'tagged'
       ORDER BY b.id`,
      [marathonId],
    );
    const riddleIds = riddleRows.map((row) => Number(row.id));
    const optionRows = riddleIds.length === 0
      ? []
      : await connection.query<{
          riddle_id: number;
          sort_order: number;
          label: string;
          is_correct: number | string;
        }>(
          `SELECT riddle_id, sort_order, label, is_correct
           FROM riddle_options
           WHERE riddle_id IN (${riddleIds.map(() => "?").join(", ")})
           ORDER BY sort_order, id`,
          riddleIds,
        );
    const document: MarathonCsvDocument = {
      marathon: {
        row: 2,
        slug: marathon.slug,
        title: marathon.title,
        subject: marathon.subject,
        description: marathon.description,
        status: marathon.status,
        startDate: marathon.startDate,
        unlockHour: marathon.unlockHour,
        reminderHour: marathon.reminderHour,
        nudgeFrom: marathon.nudgeFrom,
        nudgeUntil: marathon.nudgeUntil,
        daysCount: marathon.daysCount,
        passThreshold: marathon.passThreshold,
        finalCtaText: marathon.finalCtaText,
        finalCtaUrl: marathon.finalCtaUrl,
        introVideoUrl: marathon.introVideoUrl,
        inviteAudience: marathon.inviteAudience,
        landingRiddleCount: marathon.landingRiddleCount,
        publicChatUrl: marathon.publicChatUrl,
      },
      days: days.map((day) => ({
        row: 0,
        dayNumber: Number(day.day_number),
        topic: day.topic,
        introText: day.intro_text ?? "",
        materials: materials
          .filter((item) => Number(item.day_id) === Number(day.id))
          .map((item) => ({
            row: 0,
            order: Number(item.sort_order),
            type: item.material_type,
            body: item.url_or_body,
          })),
        tasks: tasks
          .filter((item) => Number(item.day_id) === Number(day.id))
          .map((item) => {
            const questionId = item.question_id == null ? null : Number(item.question_id);
            if (questionId) {
              return {
                row: 0,
                order: Number(item.sort_order),
                questionId,
                prompt: null,
                options: null,
                correct: null,
                explanation: null,
              };
            }
            return {
              row: 0,
              order: Number(item.sort_order),
              questionId: null,
              prompt: item.inline_prompt,
              options: parseStoredOptions(item.inline_options),
              correct: item.inline_correct == null ? null : Number(item.inline_correct),
              explanation: item.inline_explanation,
            };
          }),
      })),
      riddles: riddleRows.flatMap((riddle) => {
        const options = optionRows.filter((option) => Number(option.riddle_id) === Number(riddle.id));
        const correct = options.findIndex((option) => option.is_correct === 1 || option.is_correct === "1");
        if (options.length < 2 || correct < 0) return [];
        return [{
          row: 0,
          subject: riddle.subject,
          title: riddle.title,
          body: riddle.body,
          hint: riddle.hint,
          options: options.map((option) => option.label),
          correct: correct + 1,
        }];
      }),
    };
    return documentToCsv(document);
  }, getConnection);
}
