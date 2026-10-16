import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { checkAnswer, CheckAnswerError } from "@/modules/testing/checkAnswer";
import { finishTrainerSession, FinishTrainerSessionError } from "@/modules/testing/finishTrainerSession";
import { getAvailableTopicThemes } from "@/modules/testing/getAvailableTopicThemes";
import { markSessionStarted } from "@/modules/testing/markSessionStarted";
import { nowUnixSec } from "@/modules/testing/sessionElapsed";
import { startTopicTest, StartTopicTestError } from "@/modules/testing/startTopicTest";
import { clampTaskCount } from "@/modules/testing/topicTestMode";
import {
  TASK_STATUS_INCORRECT,
  TASK_STATUS_UNANSWERED,
} from "@/modules/testing/types";
import { absoluteSiteUrl } from "@/lib/siteOrigin";
import { composeTelegramTask } from "@/modules/telegram/taskRender";
import type { BotCallback, Outgoing } from "./botPlay";

const PAGE_SIZE = 6;
const COUNT_CHOICES = [5, 10, 20];
const LETTERS = ["А", "Б", "В", "Г"] as const;

type QuizCallback = Extract<
  BotCallback,
  { kind: "quiz" | "quizPage" | "quizTheme" | "quizStart" | "quizResume" | "quizAnswer" }
>;

export function isQuizCallback(callback: BotCallback): callback is QuizCallback {
  return (
    callback.kind === "quiz"
    || callback.kind === "quizPage"
    || callback.kind === "quizTheme"
    || callback.kind === "quizStart"
    || callback.kind === "quizResume"
    || callback.kind === "quizAnswer"
  );
}

/** Counts the bot offers. Never above 20, and never above the bank. */
export function quizCountChoices(bankSize: number): number[] {
  if (bankSize <= 0) return [];
  const offered = COUNT_CHOICES.filter((count) => count < bankSize);
  const full = Math.min(bankSize, COUNT_CHOICES[COUNT_CHOICES.length - 1]!);
  if (!offered.includes(full)) offered.push(full);
  return offered;
}

function menuButton(): { text: string; data: string } {
  return { text: "Меню", data: "mh:menu" };
}

function note(text: string, buttons?: Outgoing["buttons"]): Outgoing[] {
  return [{ text, ...(buttons ? { buttons } : {}) }];
}

async function connection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

type OpenSession = { id: number; themeName: string };

async function openSession(userId: number): Promise<OpenSession | null> {
  const db = await connection();
  try {
    const rows = await db.query<{ id: number; theme_name: string | null }>(
      `SELECT ts.id, t.name AS theme_name
       FROM task_sessions ts
       LEFT JOIN themes t ON t.id = ts.theme_id
       WHERE ts.user_id = ? AND ts.session_type = 1 AND ts.session_status = 2
         AND ts.expire_time > ?
         AND EXISTS (
           SELECT 1 FROM tasks2session t2s
           WHERE t2s.session_id = ts.id AND t2s.user_id = ts.user_id
             AND (t2s.status = ? OR (t2s.status = ? AND t2s.retry_used = 0))
         )
       ORDER BY ts.id DESC
       LIMIT 1`,
      [userId, nowUnixSec(), TASK_STATUS_UNANSWERED, TASK_STATUS_INCORRECT],
    );
    const row = rows[0];
    if (!row) return null;
    return { id: Number(row.id), themeName: row.theme_name?.trim() || "Тема" };
  } finally {
    db.release();
  }
}

async function themeList(page: number): Promise<Outgoing[]> {
  const themes = await getAvailableTopicThemes();
  if (themes.length === 0) {
    return note("У банку ще немає тем із завданнями.", [menuButton()]);
  }
  const pages = Math.ceil(themes.length / PAGE_SIZE);
  const safePage = Math.min(Math.max(page, 0), pages - 1);
  const slice = themes.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const buttons: NonNullable<Outgoing["buttons"]> = slice.map((theme) => ({
    text: `${theme.name} · ${theme.taskCount}`.slice(0, 64),
    data: `mh:qt:${theme.id}`,
  }));
  if (safePage > 0) buttons.push({ text: "Назад", data: `mh:qp:${safePage - 1}` });
  if (safePage + 1 < pages) buttons.push({ text: "Далі", data: `mh:qp:${safePage + 1}` });
  buttons.push(menuButton());
  return [{
    text: pages > 1 ? `Оберіть тему (${safePage + 1}/${pages})` : "Оберіть тему",
    buttons,
  }];
}

async function countPicker(themeId: number): Promise<Outgoing[]> {
  const themes = await getAvailableTopicThemes();
  const theme = themes.find((item) => item.id === themeId);
  if (!theme) return note("Цієї теми немає в банку.", [{ text: "До тем", data: "mh:qp:0" }, menuButton()]);
  const choices = quizCountChoices(theme.taskCount);
  return [{
    text: `${theme.name}\nУ банку ${theme.taskCount}. Скільки завдань взяти?`,
    buttons: [
      ...choices.map((count) => ({
        text: String(count),
        data: `mh:qn:${theme.id}:${count}`,
      })),
      { text: "До тем", data: "mh:qp:0" },
      menuButton(),
    ],
  }];
}

type PlayRow = {
  mapping_id: number;
  status: number;
  retry_used: number;
  task_text: string | null;
  answer_1: string | null;
  answer_2: string | null;
  answer_3: string | null;
  answer_4: string | null;
  tasks_number: number;
  theme_name: string | null;
};

async function loadPlay(userId: number, sessionId: number): Promise<PlayRow[] | null> {
  const db = await connection();
  try {
    const rows = await db.query<PlayRow>(
      `SELECT t2s.id AS mapping_id, t2s.status, t2s.retry_used,
              qt.task_text, qt.answer_1, qt.answer_2, qt.answer_3, qt.answer_4,
              ts.tasks_number, t.name AS theme_name
       FROM tasks2session t2s
       INNER JOIN task_sessions ts ON ts.id = t2s.session_id AND ts.user_id = t2s.user_id
       INNER JOIN quiz_tasks qt ON qt.id = t2s.task_id AND t2s.task_type = 1
       LEFT JOIN themes t ON t.id = ts.theme_id
       WHERE t2s.session_id = ? AND t2s.user_id = ?
       ORDER BY t2s.id`,
      [sessionId, userId],
    );
    return rows.length > 0 ? rows : null;
  } finally {
    db.release();
  }
}

function pending(row: PlayRow): boolean {
  if (Number(row.status) === TASK_STATUS_UNANSWERED) return true;
  return Number(row.status) === TASK_STATUS_INCORRECT && Number(row.retry_used) === 0;
}

export function buildQuizQuestion(input: {
  themeName: string;
  index: number;
  total: number;
  prompt: string;
  options: string[];
  sessionId: number;
  mappingId: number;
  retry: boolean;
  preface?: string;
}): Outgoing {
  const prefix = input.retry ? "r" : "a";
  const heading = [
    input.preface?.trim() ?? "",
    `${input.themeName.trim() || "Тема"} · ${input.index}/${input.total}`,
  ].filter(Boolean).join("\n");
  return composeTelegramTask({
    heading,
    prompt: input.prompt.trim() || "Завдання",
    options: input.options,
    optionData: input.options.map((_, option) => (
      `mh:q${prefix}:${input.sessionId}:${input.mappingId}:${option + 1}`
    )),
    trailingButtons: [menuButton()],
    siteUrl: absoluteSiteUrl(`/session/${input.sessionId}`),
    siteLabel: "Відкрити на сайті",
  });
}

function questionMessage(sessionId: number, rows: PlayRow[], preface?: string): Outgoing[] {
  const index = rows.findIndex(pending);
  const row = index >= 0 ? rows[index] : undefined;
  if (!row) return [];
  const options = [row.answer_1, row.answer_2, row.answer_3, row.answer_4]
    .map((text) => text?.trim() ?? "")
    .filter((text) => text.length > 0);
  return [buildQuizQuestion({
    themeName: row.theme_name?.trim() || "Тема",
    index: index + 1,
    total: rows.length,
    prompt: row.task_text?.trim() || "Завдання",
    options,
    sessionId,
    mappingId: Number(row.mapping_id),
    retry: Number(row.status) === TASK_STATUS_INCORRECT,
    ...(preface ? { preface } : {}),
  })];
}

async function showSession(userId: number, sessionId: number, preface?: string): Promise<Outgoing[]> {
  try {
    await markSessionStarted({ userId, sessionId });
  } catch {
    // The clock is optional; the question still has to open.
  }
  const rows = await loadPlay(userId, sessionId);
  if (!rows) return note("Цю сесію не знайдено.", [menuButton()]);
  const question = questionMessage(sessionId, rows, preface);
  if (question.length > 0) return question;
  try {
    const summary = await finishTrainerSession({ userId, sessionId });
    const lead = preface?.trim() ? `${preface.trim()}\n\n` : "";
    return note(
      `${lead}${rows[0]?.theme_name?.trim() || "Тест"} завершено.\nЗ першої спроби: ${summary.rightNumber} з ${summary.tasksNumber} (${summary.percent}%).`,
      [{ text: "Ще тест", data: "mh:qp:0" }, menuButton()],
    );
  } catch (error) {
    if (error instanceof FinishTrainerSessionError && error.code === "session_expired") {
      return note("Час цієї сесії минув. Почніть нову.", [{ text: "Новий тест", data: "mh:qp:0" }, menuButton()]);
    }
    return note("Не вдалося зберегти підсумок. Спробуйте ще раз.", [menuButton()]);
  }
}

export async function presentBotQuiz(userId: number, callback: QuizCallback): Promise<Outgoing[]> {
  if (callback.kind === "quiz") {
    const open = await openSession(userId);
    if (!open) return themeList(0);
    return note(`Є незавершений тест: ${open.themeName}.`, [
      { text: "Продовжити", data: "mh:qc" },
      { text: "Нова тема", data: "mh:qp:0" },
      menuButton(),
    ]);
  }
  if (callback.kind === "quizPage") return themeList(callback.page);
  if (callback.kind === "quizTheme") return countPicker(callback.themeId);
  if (callback.kind === "quizResume") {
    const open = await openSession(userId);
    if (!open) return themeList(0);
    return showSession(userId, open.id);
  }
  if (callback.kind === "quizStart") {
    const themes = await getAvailableTopicThemes();
    const theme = themes.find((item) => item.id === callback.themeId);
    if (!theme) return note("Цієї теми немає в банку.", [{ text: "До тем", data: "mh:qp:0" }, menuButton()]);
    const count = clampTaskCount(callback.count, Math.min(theme.taskCount, 20));
    if (count < 1) return note("У цій темі ще немає завдань.", [menuButton()]);
    try {
      const started = await startTopicTest({
        userId,
        themeId: theme.id,
        taskCount: count,
        mode: "standard",
      });
      return showSession(userId, started.sessionId);
    } catch (error) {
      if (error instanceof StartTopicTestError && error.code === "insufficient_tasks") {
        return note("У цій темі ще немає завдань.", [menuButton()]);
      }
      if (error instanceof StartTopicTestError && error.code === "already_in_progress") {
        return note("Тест уже запускається. Спробуйте ще раз за секунду.", [menuButton()]);
      }
      return note("Не вдалося почати тест. Спробуйте пізніше.", [menuButton()]);
    }
  }
  try {
    const answerNumber = callback.option;
    if (answerNumber !== 1 && answerNumber !== 2 && answerNumber !== 3 && answerNumber !== 4) {
      return note("Такого варіанта немає.", [menuButton()]);
    }
    const result = await checkAnswer({
      userId,
      sessionId: callback.sessionId,
      mappingId: callback.mappingId,
      answerNumber,
      attempt: callback.attempt,
    });
    if (result.retryAvailable) {
      return showSession(userId, callback.sessionId, "Неправильно. Спробуйте ще раз.");
    }
    if (result.revealed) {
      const letter = result.revealed.correctAnswerNumber
        ? LETTERS[result.revealed.correctAnswerNumber - 1] ?? String(result.revealed.correctAnswerNumber)
        : "";
      const lines = ["Неправильно."];
      if (letter) lines.push(`Правильна відповідь: ${letter}.`);
      if (result.revealed.explanation) lines.push(result.revealed.explanation);
      return showSession(userId, callback.sessionId, lines.join("\n"));
    }
    return showSession(userId, callback.sessionId, result.correct ? "Правильно." : "Відповідь збережено.");
  } catch (error) {
    if (error instanceof CheckAnswerError && error.code === "session_expired") {
      return note("Час цієї сесії минув. Почніть нову.", [{ text: "Новий тест", data: "mh:qp:0" }, menuButton()]);
    }
    return note("Не вдалося перевірити відповідь. Спробуйте ще раз.", [menuButton()]);
  }
}
