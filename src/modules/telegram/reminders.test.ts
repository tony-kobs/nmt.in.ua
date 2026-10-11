import assert from "node:assert/strict";
import { test } from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { DEADLINE_REMINDER_WINDOW_SEC, processTelegramTaskNotifications } from "./notifications";
import { getKyivClock } from "./taskDay";
import type { TelegramReply } from "./taskInteraction";
import type { TelegramSendResult } from "./transport";

const config = { botToken: "private-bot-token", webhookSecret: "reference-secret", botUsername: "test_bot" };
/** 2026-01-15 10:00 Kyiv (UTC+2): outside both digest windows. */
const morning = Date.UTC(2026, 0, 15, 8, 0) / 1000;
/** 2026-01-15 17:30 Kyiv: inside the student digest window. */
const evening = Date.UTC(2026, 0, 15, 15, 30) / 1000;
/** 2026-01-15 20:30 Kyiv: inside the teacher summary window. */
const night = Date.UTC(2026, 0, 15, 18, 30) / 1000;

type Task = { id: number; user_id: number; expire_time: number; due_at?: number | null; theme_name?: string };
type PrefRow = Record<string, unknown>;
type TeacherRow = { session_id: number; student_id: number; teacher_user_id: number; display_name: string; theme_name: string;
  session_status: number; tasks_number: number; right_number: number; time: number; onRoster: boolean };

function fake(input: {
  now: number;
  tasks?: Task[];
  accounts?: { id: number; user_id: number; telegram_user_id: string; telegram_chat_id: string; role: string }[];
  prefs?: Map<number, PrefRow> | "missing";
  teacher?: TeacherRow[];
  summary?: { theme_name: string; due_at: number; members: number; completed: number }[];
  /** Sessions whose roster link disappears between selection and the locked re-read. */
  revokedOnLock?: number[];
}) {
  const accounts = input.accounts ?? [{ id: 1, user_id: 7, telegram_user_id: "123", telegram_chat_id: "123", role: "student" }];
  const prefs = input.prefs ?? new Map<number, PrefRow>();
  const tasks = input.tasks ?? [];
  const teacher = input.teacher ?? [];
  const ledger = new Map<string, { state: string; deliveredUnix: number | null }>();
  const replies: TelegramReply[] = [];
  const logs: unknown[] = [];
  const sql: string[] = [];
  let result: TelegramSendResult = { status: "sent", messageId: 500 };
  const pref = (id: number): PrefRow => {
    if (prefs === "missing") throw Object.assign(new Error("no table"), { errno: 1146 });
    if (!prefs.has(id)) prefs.set(id, { account_id: id, new_tasks: 1, deadline_reminders: 1, daily_reminder: 1, teacher_results: 1, teacher_daily: 0, quiet_start: null, quiet_end: null, baseline_unix: null, student_digest_on: null, teacher_digest_on: null });
    return prefs.get(id)!;
  };
  const taskRow = (task: Task) => ({ user_id: task.user_id, id: task.id, session_type: 1, theme_id: 1, theme_name: task.theme_name ?? "Алгебра",
    session_status: 2, tasks_number: 4, expire_time: task.expire_time, mapping_count: 4, answered_count: 1, due_at: task.due_at ?? null });
  const connection: SqlConnection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    query: async <T>(text: string, params: unknown[] = []) => {
      sql.push(text);
      if (text.includes("FROM telegram_notification_preferences")) {
        if (prefs === "missing") throw Object.assign(new Error("Table doesn't exist"), { errno: 1146, code: "ER_NO_SUCH_TABLE" });
        return [...prefs.values()].filter((row) => params.includes(row.account_id)) as T[];
      }
      if (text.includes("SELECT delivery_state")) {
        const row = ledger.get(params.join(":"));
        return (row ? [{ delivery_state: row.state, delivered_unix: row.deliveredUnix }] : []) as T[];
      }
      if (text.includes("FOR UPDATE") && text.includes("user_telegram_accounts")) {
        const teacherOnly = text.includes("u.role IN");
        return accounts.filter((a) => a.id === params[0] && a.telegram_user_id === params[1] && (!teacherOnly || a.role !== "student")) as T[];
      }
      if (text.includes("GROUP BY ma.id")) {
        assert.match(text, /INNER JOIN teacher_students tst/);
        assert.equal(params[0], 70);
        return (input.summary ?? []) as T[];
      }
      if (text.includes("LEFT JOIN task_sessions")) {
        assert.match(text, /u\.is_banned = 0/);
        const link = accounts.find((a) => a.telegram_user_id === params.at(-1));
        if (!link) return [];
        const target = text.includes("ts.id = ?") ? Number(params[5]) : undefined;
        const now = Number(params[4]);
        const rows = tasks.filter((t) => t.user_id === link.user_id && t.expire_time > now && (t.due_at == null || t.due_at > now)
          && (target === undefined || t.id === target)).map(taskRow);
        return (rows.length ? rows : [{ user_id: link.user_id, id: null }]) as T[];
      }
      if (text.includes("FOR UPDATE") && (text.startsWith("SELECT id FROM task_sessions") || text.includes("SELECT ma.id FROM"))) return [];
      if (text.includes("LEFT JOIN telegram_task_notifications n")) {
        assert.match(text, /INNER JOIN teacher_students tst ON tst\.teacher_user_id = ma\.teacher_user_id/);
        assert.match(text, /ma\.teacher_user_id = \? AND ma\.status = 'active'/);
        return teacher.filter((row) => row.teacher_user_id === params[2] && row.onRoster
          && !["sending", "delivered"].includes(ledger.get(`${params[0]}:${row.session_id}:teacher_result`)?.state ?? "")) as T[];
      }
      if (text.includes("ts.id = ?") && text.includes("FOR UPDATE")) {
        return teacher.filter((row) => row.teacher_user_id === params[0] && row.session_id === params[1] && row.onRoster
          && !(input.revokedOnLock ?? []).includes(row.session_id)) as T[];
      }
      if (text.includes("FROM user_telegram_accounts")) return accounts as T[];
      assert.fail(text);
    },
    execute: async (text: string, params: unknown[] = []) => {
      sql.push(text);
      if (text.includes("INSERT INTO telegram_task_notifications") && text.includes("SELECT ?, ts.id")) {
        for (const row of teacher.filter((item) => item.teacher_user_id === params[2])) {
          const key = `${params[0]}:${row.session_id}:teacher_result`;
          if (!ledger.has(key) || ledger.get(key)!.state === "ready") ledger.set(key, { state: "delivered", deliveredUnix: null });
        }
        return { insertId: 0, affectedRows: 1 };
      }
      if (text.includes("INSERT INTO telegram_task_notifications")) {
        if (!ledger.has(params.join(":"))) ledger.set(params.join(":"), { state: "ready", deliveredUnix: null });
        return { insertId: 0, affectedRows: 1 };
      }
      if (text.includes("SET delivery_state = 'sending'")) { ledger.get(params.join(":"))!.state = "sending"; return { insertId: 0, affectedRows: 1 }; }
      if (text.includes("UPDATE telegram_task_notifications")) {
        const row = ledger.get(params.slice(2).join(":"))!;
        row.state = String(params[0]);
        row.deliveredUnix = params[0] === "delivered" ? input.now : null;
        return { insertId: 0, affectedRows: 1 };
      }
      if (text.includes("teacher_baseline_at) VALUES")) { pref(Number(params[0])).baseline_unix = input.now; return { insertId: 0, affectedRows: 1 }; }
      if (text.includes("INSERT INTO telegram_notification_preferences (account_id) VALUES")) { pref(Number(params[0])); return { insertId: 0, affectedRows: 1 }; }
      const claim = /UPDATE telegram_notification_preferences SET (\w+) = \?\s+WHERE account_id = \? AND \(/.exec(text);
      if (claim) {
        const row = pref(Number(params[1]));
        if (row[claim[1]] === params[2]) return { insertId: 0, affectedRows: 0 };
        row[claim[1]] = params[0];
        return { insertId: 0, affectedRows: 1 };
      }
      const release = /UPDATE telegram_notification_preferences SET (\w+) = \? WHERE account_id = \? AND \w+ = \?/.exec(text);
      if (release) {
        const row = pref(Number(params[1]));
        if (row[release[1]] === params[2]) row[release[1]] = params[0];
        return { insertId: 0, affectedRows: 1 };
      }
      assert.fail(text);
    },
  };
  return {
    ledger, replies, logs, sql, prefs, pref,
    setResult: (value: TelegramSendResult) => { result = value; },
    run: (now = input.now) => processTelegramTaskNotifications({
      getConnection: async () => connection, readConfig: () => config, nowSec: () => now,
      logError: (value) => { logs.push(value); },
      send: async (reply) => { replies.push(reply); return result; },
    }),
  };
}

test("Kyiv clock follows DST and ignores the host timezone", () => {
  assert.deepEqual(getKyivClock(Date.UTC(2026, 2, 29, 0, 30) / 1000), { date: "2026-03-29", hour: 2 });
  assert.deepEqual(getKyivClock(Date.UTC(2026, 2, 29, 1, 30) / 1000), { date: "2026-03-29", hour: 4 });
  assert.deepEqual(getKyivClock(Date.UTC(2026, 9, 25, 0, 30) / 1000), { date: "2026-10-25", hour: 3 });
  assert.deepEqual(getKyivClock(Date.UTC(2026, 9, 25, 1, 30) / 1000), { date: "2026-10-25", hour: 3 });
  assert.deepEqual(getKyivClock(Date.UTC(2026, 0, 15, 22, 30) / 1000), { date: "2026-01-16", hour: 0 });
  assert.deepEqual(getKyivClock(Date.UTC(2026, 6, 15, 14, 30) / 1000), { date: "2026-07-15", hour: 17 });
});

test("a new task inside the deadline window gets one message that already shows the deadline", async () => {
  const db = fake({ now: morning, tasks: [{ id: 42, user_id: 7, expire_time: morning + 3600 }] });
  assert.equal((await db.run()).sent, 1);
  assert.match(db.replies[0].text, /Нове завдання/);
  assert.match(db.replies[0].text, /Термін: 15\.01\.2026, 11:00/);
  for (let i = 0; i < 3; i++) await db.run(morning + 60 * (i + 1));
  assert.equal(db.replies.length, 1);
  assert.equal(db.ledger.has("1:42:deadline_soon"), false);
});

test("a deadline reminder follows an earlier new-task message exactly once", async () => {
  const deadline = morning + 2 * 3600;
  const db = fake({ now: morning, tasks: [{ id: 42, user_id: 7, expire_time: deadline + 86400, due_at: deadline }] });
  db.ledger.set("1:42:new_task", { state: "delivered", deliveredUnix: deadline - DEADLINE_REMINDER_WINDOW_SEC - 3600 });
  assert.equal((await db.run()).sent, 1);
  assert.match(db.replies[0].text, /^⏰ <b>Скоро термін<\/b>/);
  assert.match(db.replies[0].text, /Термін: 15\.01\.2026, 12:00/);
  assert.equal(db.replies[0].replyMarkup!.inline_keyboard[0][0].callback_data!.startsWith("d:"), true);
  assert.doesNotMatch(db.replies[0].text, /42/);
  assert.equal(db.ledger.get("1:42:deadline_soon")?.state, "delivered");
  await db.run(morning + 300);
  assert.equal(db.replies.length, 1);
});

test("deadline reminders wait for a settled new-task message and skip distant, expired or disabled cases", async () => {
  const soon = morning + 3600;
  for (const [name, setup] of [
    ["uncertain new-task", (db: ReturnType<typeof fake>) => db.ledger.set("1:42:new_task", { state: "sending", deliveredUnix: null })],
    ["disabled", (db: ReturnType<typeof fake>) => {
      db.ledger.set("1:42:new_task", { state: "delivered", deliveredUnix: morning - 86400 });
      db.pref(1).deadline_reminders = 0;
    }],
  ] as const) {
    const db = fake({ now: morning, tasks: [{ id: 42, user_id: 7, expire_time: soon }] });
    setup(db);
    await db.run();
    assert.equal(db.replies.length, 0, name);
  }
  const far = fake({ now: morning, tasks: [{ id: 42, user_id: 7, expire_time: morning + DEADLINE_REMINDER_WINDOW_SEC + 60 }] });
  far.ledger.set("1:42:new_task", { state: "delivered", deliveredUnix: morning - 86400 });
  await far.run();
  assert.equal(far.replies.length, 0);
  const expired = fake({ now: morning, tasks: [{ id: 42, user_id: 7, expire_time: morning }] });
  expired.ledger.set("1:42:new_task", { state: "delivered", deliveredUnix: morning - 86400 });
  await expired.run();
  assert.equal(expired.replies.length, 0);
});

test("new-task notifications respect the account preference while deadline reminders still apply", async () => {
  const db = fake({ now: morning, tasks: [{ id: 42, user_id: 7, expire_time: morning + 3600 }, { id: 43, user_id: 7, expire_time: morning + 86400 }] });
  db.pref(1).new_tasks = 0;
  await db.run();
  assert.equal(db.replies.length, 1);
  assert.match(db.replies[0].text, /Скоро термін/);
  assert.equal(db.ledger.has("1:42:new_task"), false);
  assert.equal(db.ledger.has("1:43:new_task"), false);
});

test("quiet hours defer everything without claiming, then delivery resumes", async () => {
  const late = Date.UTC(2026, 0, 15, 21, 30) / 1000; // 23:30 Kyiv
  const db = fake({ now: late, tasks: [{ id: 42, user_id: 7, expire_time: late + 86400 * 2 }] });
  Object.assign(db.pref(1), { quiet_start: 22, quiet_end: 8 });
  const quiet = await db.run();
  assert.equal(quiet.sent, 0);
  assert.equal(db.replies.length, 0);
  assert.equal(db.ledger.size, 0);
  const after = Date.UTC(2026, 0, 16, 6, 0) / 1000; // 08:00 Kyiv
  assert.equal((await db.run(after)).sent, 1);
});

test("the unfinished-task reminder goes out once per Kyiv day inside its window", async () => {
  const tasks = [{ id: 42, user_id: 7, expire_time: evening + 5 * 86400 }, { id: 43, user_id: 7, expire_time: evening + 6 * 86400, theme_name: "<b>Геометрія</b>" }];
  const db = fake({ now: evening, tasks });
  for (const key of ["1:42:new_task", "1:43:new_task"]) db.ledger.set(key, { state: "delivered", deliveredUnix: evening - 86400 });
  assert.equal((await db.run()).sent, 1);
  assert.match(db.replies[0].text, /Незавершені завдання: 2/);
  assert.match(db.replies[0].text, /&lt;b&gt;Геометрія&lt;\/b&gt;/);
  assert.equal(db.pref(1).student_digest_on, "2026-01-15");
  await db.run(evening + 600);
  assert.equal(db.replies.length, 1);
  const before = fake({ now: evening - 3600, tasks });
  for (const key of ["1:42:new_task", "1:43:new_task"]) before.ledger.set(key, { state: "delivered", deliveredUnix: evening - 86400 });
  await before.run();
  assert.equal(before.replies.length, 0, "16:30 Kyiv is before the window");
});

test("a rejected daily reminder frees the day; an uncertain one keeps it to avoid duplicates", async () => {
  const tasks = [{ id: 42, user_id: 7, expire_time: evening + 5 * 86400 }];
  const rejected = fake({ now: evening, tasks });
  rejected.ledger.set("1:42:new_task", { state: "delivered", deliveredUnix: evening - 86400 });
  rejected.setResult({ status: "rejected", context: { errorCode: 403 } });
  assert.equal((await rejected.run()).rejected, 1);
  assert.equal(rejected.pref(1).student_digest_on, null);
  const uncertain = fake({ now: evening, tasks });
  uncertain.ledger.set("1:42:new_task", { state: "delivered", deliveredUnix: evening - 86400 });
  uncertain.setResult({ status: "unknown", context: { errorName: "TimeoutError" } });
  assert.equal((await uncertain.run()).uncertain, 1);
  uncertain.setResult({ status: "sent", messageId: 1 });
  await uncertain.run(evening + 600);
  assert.equal(uncertain.replies.length, 1);
});

test("without migration 042 the processor keeps TG-007 new-task behaviour only", async () => {
  const db = fake({ now: evening, prefs: "missing", tasks: [{ id: 42, user_id: 7, expire_time: evening + 3600 }] });
  assert.equal((await db.run()).sent, 1);
  assert.match(db.replies[0].text, /Нове завдання/);
  await db.run(evening + 600);
  assert.equal(db.replies.length, 1);
  assert.ok(db.sql.every((text) => !/INSERT INTO telegram_notification_preferences|UPDATE telegram_notification_preferences/.test(text)));
});

const teacherAccount = { id: 5, user_id: 70, telegram_user_id: "555", telegram_chat_id: "555", role: "teacher" };
const completed = (sessionId: number, patch: Partial<TeacherRow> = {}): TeacherRow => ({
  session_id: sessionId, student_id: 7, teacher_user_id: 70, display_name: "Олена <script>", theme_name: "Алгебра",
  session_status: 1, tasks_number: 10, right_number: 8, time: 300, onRoster: true, ...patch,
});

test("teacher notifications start from a baseline instead of flooding history", async () => {
  const teacher = [completed(100), completed(101)];
  const db = fake({ now: morning, accounts: [teacherAccount], teacher });
  assert.equal((await db.run()).sent, 0);
  assert.equal(db.replies.length, 0);
  assert.equal(db.ledger.get("5:100:teacher_result")?.state, "delivered");
  teacher.push(completed(102, { right_number: 5 }));
  assert.equal((await db.run(morning + 300)).sent, 1);
  const reply = db.replies[0];
  assert.match(reply.text, /Учень завершив завдання/);
  assert.match(reply.text, /Олена &lt;script&gt;/);
  assert.match(reply.text, /5\/10 \(50%\)/);
  assert.equal(reply.chatId, "555");
  assert.match(reply.replyMarkup!.inline_keyboard[0][0].url!, /\/students\/7$/);
  await db.run(morning + 600);
  assert.equal(db.replies.length, 1);
});

test("teacher results are never sent for unrelated students, revoked access or disabled preference", async () => {
  const off = fake({ now: morning, accounts: [teacherAccount], teacher: [completed(100, { onRoster: false }), completed(101, { teacher_user_id: 71 })] });
  off.pref(5).baseline_unix = morning - 60;
  await off.run();
  assert.equal(off.replies.length, 0);
  const student = fake({ now: morning, accounts: [{ ...teacherAccount, role: "student" }], teacher: [completed(100)] });
  student.pref(5).baseline_unix = morning - 60;
  await student.run();
  assert.equal(student.replies.length, 0);
  assert.ok(student.sql.every((text) => !text.includes("LEFT JOIN telegram_task_notifications n")));
  const disabled = fake({ now: morning, accounts: [teacherAccount], teacher: [completed(100)] });
  Object.assign(disabled.pref(5), { baseline_unix: morning - 60, teacher_results: 0 });
  await disabled.run();
  assert.equal(disabled.replies.length, 0);
  const lockFails = fake({ now: morning, accounts: [teacherAccount], teacher: [completed(100)], revokedOnLock: [100] });
  lockFails.pref(5).baseline_unix = morning - 60;
  const counts = await lockFails.run();
  assert.equal(counts.sent, 0);
  assert.equal(counts.skipped, 1);
  assert.equal(lockFails.replies.length, 0);
  assert.equal(lockFails.ledger.get("5:100:teacher_result")?.state, "ready");
});

test("the teacher daily summary is opt-in, scoped and sent once per day", async () => {
  const summary = [{ theme_name: "Алгебра", due_at: night + 86400, members: 5, completed: 3 }, { theme_name: "Геометрія", due_at: night - 3600, members: 4, completed: 2 }];
  const db = fake({ now: night, accounts: [teacherAccount], summary });
  db.pref(5).baseline_unix = night - 60;
  await db.run();
  assert.equal(db.replies.length, 0, "summary is off by default");
  db.pref(5).teacher_daily = 1;
  assert.equal((await db.run()).sent, 1);
  assert.match(db.replies[0].text, /Підсумок дня/);
  assert.match(db.replies[0].text, /Завершили: 3\/5/);
  assert.match(db.replies[0].text, /не встигли: 2/);
  await db.run(night + 600);
  assert.equal(db.replies.length, 1);
});
