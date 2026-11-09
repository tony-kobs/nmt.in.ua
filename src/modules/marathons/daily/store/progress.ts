import "server-only";

import { evaluateDayAccess } from "../calendar";
import { durationSeconds } from "../durationText";
import { parseStoredAnswers, projectReviewedTask } from "../playTasks";
import type { ProgressMark } from "../streak";
import { submitOpenedDay, type SubmitSuccess } from "../submit";
import { composeBoard } from "./board";
import { asMs, flag, withConn, type Conn } from "./db";
import { loadReviewRows } from "./tasks";
import type { DailyMarathon, DayProgress, MarathonDay } from "./types";

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
      started_at: unknown;
      submitted_at: unknown;
      duration_seconds: number | null;
      answers_json: string | null;
      correct_count: number | null;
    }>(
      `SELECT pr.day_id, d.day_number, pr.materials_viewed_at, pr.score, pr.passed,
              pr.completed_at, pr.started_at, pr.submitted_at, pr.duration_seconds,
              pr.answers_json, pr.correct_count
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
      startedAt: asMs(row.started_at),
      submittedAt: asMs(row.submitted_at),
      durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
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

/** First open of the day's tasks. A later refresh does not move the start. */
export async function markDayTestStarted(input: {
  marathonId: number;
  userId: number;
  dayId: number;
  now: Date;
}, getConnection?: Conn): Promise<void> {
  if (!Number.isInteger(input.marathonId) || !Number.isInteger(input.userId) || !Number.isInteger(input.dayId)) {
    return;
  }
  await withConn(async (connection) => {
    await connection.execute(
      `INSERT INTO marathon_day_progress (marathon_id, user_id, day_id, started_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         started_at = IF(completed_at IS NULL, COALESCE(started_at, VALUES(started_at)), started_at)`,
      [input.marathonId, input.userId, input.dayId, input.now],
    );
  }, getConnection);
}

/** Marks materials seen after the Telegram day packet was actually delivered. */
export async function recordMaterialsDelivered(
  marathonId: number,
  userId: number,
  dayId: number,
  now: Date,
  getConnection?: Conn,
): Promise<void> {
  if (!Number.isInteger(marathonId) || !Number.isInteger(userId) || !Number.isInteger(dayId)) return;
  await withConn(async (connection) => {
    await connection.execute(
      `INSERT INTO marathon_day_progress (marathon_id, user_id, day_id, materials_viewed_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         materials_viewed_at = COALESCE(materials_viewed_at, VALUES(materials_viewed_at))`,
      [marathonId, userId, dayId, now],
    );
  }, getConnection);
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
    await connection.beginTransaction();
    try {
    await connection.query(
      `SELECT user_id FROM marathon_participants
       WHERE marathon_id = ? AND user_id = ?
       LIMIT 1
       FOR UPDATE`,
      [input.marathon.id, input.userId],
    );
    const existing = await connection.query<{
      completed_at: unknown;
      started_at: unknown;
      score: number | null;
      passed: number;
      streak: number;
    }>(
      `SELECT pr.completed_at, pr.started_at, pr.score, pr.passed, p.streak
       FROM marathon_day_progress pr
       INNER JOIN marathon_participants p
         ON p.marathon_id = pr.marathon_id AND p.user_id = pr.user_id
       WHERE pr.marathon_id = ? AND pr.user_id = ? AND pr.day_id = ?
       LIMIT 1
       FOR UPDATE`,
      [input.marathon.id, input.userId, input.day.id],
    );
    const prior = existing[0];
    if (prior?.completed_at) {
      await connection.commit();
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
          const taken = durationSeconds(asMs(prior?.started_at), input.now.getTime());
          await connection.execute(
            `INSERT INTO marathon_day_progress
              (marathon_id, user_id, day_id, materials_viewed_at, score, passed, completed_at, submitted_at, duration_seconds, answers_json, correct_count)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               score = VALUES(score),
               passed = VALUES(passed),
               completed_at = IF(completed_at IS NULL, VALUES(completed_at), completed_at),
               submitted_at = IF(submitted_at IS NULL, VALUES(submitted_at), submitted_at),
               duration_seconds = IF(duration_seconds IS NULL, VALUES(duration_seconds), duration_seconds),
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
              input.now,
              taken,
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
    if (!submitted.ok) {
      await connection.rollback();
      return submitted;
    }
    const board = await composeBoard(connection, input.marathon.id, true);
    const self = board.find((row) => row.userId === input.userId) ?? null;
    await connection.commit();
    return {
      ...submitted,
      fresh: true,
      correct: dayCorrect,
      rank: self
        ? { place: self.place, prevPlace: self.prevPlace, points: self.points }
        : null,
    };
    } catch (error) {
      await connection.rollback();
      throw error;
    }
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
