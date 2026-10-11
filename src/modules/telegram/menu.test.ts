import assert from "node:assert/strict";
import { test } from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import type { TelegramAccountResult } from "./account";
import { handleMenuRequest, parseMenuCallback, parseMenuCommand, parseMenuData } from "./menu";
import { formatQuietHours, isQuietHour, quietPresetIndex, togglesForRole } from "./preferences";
import { resolveTaskReference } from "./taskReference";
import { handleTelegramUpdate } from "./webhook";

const secret = "reference-secret";
const student: TelegramAccountResult = { status: "success", profile: { accountId: 1, userId: 7, role: "student", displayName: "Іра <b>", linkedAt: 1_800_000_000 } };
const teacher: TelegramAccountResult = { status: "success", profile: { accountId: 5, userId: 70, role: "teacher", displayName: "Олег", linkedAt: null } };
const notLinked: TelegramAccountResult = { status: "error", code: "notLinked" };

const message = (text: string, chat = 123, from = 123, type = "private") => ({ message: { chat: { id: chat, type }, from: { id: from }, text } });
const press = (data: string, from = 123, chat = 123, type = "private") => ({
  callback_query: { id: "q1", data, from: { id: from }, message: { message_id: 77, chat: { id: chat, type } } },
});

function prefsConnection() {
  const rows = new Map<number, Record<string, unknown>>();
  const writes: { sql: string; params: unknown[] }[] = [];
  const connection: SqlConnection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    query: async <T>(sql: string, params: unknown[] = []) => {
      if (sql.includes("FROM telegram_notification_preferences")) return [...rows.values()].filter((row) => params.includes(row.account_id)) as T[];
      if (sql.includes("GROUP BY ma.id")) {
        assert.equal(params[0], 70, "summary is scoped to the verified teacher");
        return [{ theme_name: "Алгебра", due_at: 1_900_000_000, members: 3, completed: 1 }] as T[];
      }
      assert.fail(sql);
    },
    execute: async (sql: string, params: unknown[] = []) => {
      writes.push({ sql, params });
      const id = Number(params[0]);
      const row = rows.get(id) ?? { account_id: id, new_tasks: 1, deadline_reminders: 1, daily_reminder: 1, teacher_results: 1, teacher_daily: 0, quiet_start: null, quiet_end: null };
      const toggle = /\((account_id), (\w+)\) VALUES \(\?, \?\)\s+ON DUPLICATE KEY UPDATE \2 = 1 - \2/.exec(sql);
      if (toggle) row[toggle[2]] = rows.has(id) ? 1 - Number(row[toggle[2]]) : params[1];
      else if (sql.includes("quiet_start, quiet_end) VALUES")) Object.assign(row, { quiet_start: params[1], quiet_end: params[2] });
      else assert.fail(sql);
      rows.set(id, row);
      return { insertId: 0, affectedRows: 1 };
    },
  };
  return { rows, writes, getConnection: async () => connection };
}

test("bare /start and /menu open the role-based main menu for linked accounts only", async () => {
  const marathonCalls: string[] = [];
  const base = {
    consume: async () => { assert.fail("bare /start never consumes a link"); },
    marathon: async () => { marathonCalls.push("marathon"); return [{ chatId: "123", text: "marathon menu" }]; },
    marathonBareStart: async () => { marathonCalls.push("bare"); return { chatId: "123", text: "marathon start" }; },
  };
  for (const text of ["/start", "/menu", "/menu@nmt_bot"]) {
    const reply = await handleTelegramUpdate(message(text), { ...base, getProfile: async () => student, menu: { hasMarathon: async () => false } });
    assert.match(reply!.text, /Вітаємо, Іра &lt;b&gt;!/);
    const labels = reply!.replyMarkup!.inline_keyboard.flat().map((button) => button.text);
    assert.deepEqual(labels, ["📚 Мої завдання", "📅 Сьогодні", "📊 Моя статистика", "🔔 Сповіщення", "👤 Мій акаунт", "❓ Допомога", "🏆 Рейтинг"]);
    assert.equal(reply!.parseMode, "HTML");
  }
  const teacherMenu = await handleTelegramUpdate(message("/menu"), { ...base, getProfile: async () => teacher, menu: { hasMarathon: async () => true } });
  const teacherButtons = teacherMenu!.replyMarkup!.inline_keyboard.flat();
  assert.deepEqual(teacherButtons.map((button) => button.callback_data), ["m:stud", "m:lb", "m:notif", "m:acct", "m:help", "mh:menu"]);
  assert.deepEqual(marathonCalls, []);
  // Not linked (or lookup failed): the marathon bot keeps /menu and bare /start exactly as before.
  for (const profile of [notLinked, { status: "error", code: "databaseFailure" } as TelegramAccountResult]) {
    assert.equal((await handleTelegramUpdate(message("/menu"), { ...base, getProfile: async () => profile }))!.text, "marathon menu");
    assert.equal((await handleTelegramUpdate(message("/start"), { ...base, getProfile: async () => profile }))!.text, "marathon start");
  }
  assert.deepEqual(marathonCalls, ["marathon", "bare", "marathon", "bare"]);
});

test("deep links, marathon codes, /top and marathon callbacks keep their existing handlers", async () => {
  const seen: string[] = [];
  const deps = {
    getProfile: async () => { seen.push("profile"); return student; },
    consume: async (token: string) => { seen.push(`link:${token}`); return true; },
    consumeMarathon: async (token: string) => { seen.push(`marathon-link:${token}`); return true; },
    marathon: async () => { seen.push("marathon"); return [{ chatId: "123", text: "m" }]; },
  };
  const linked = await handleTelegramUpdate(message("/start abc"), deps);
  assert.match(linked!.text, /успішно/);
  assert.equal(linked!.replyMarkup!.inline_keyboard[0][0].callback_data, "m:home");
  await handleTelegramUpdate(message("/start mth_code"), deps);
  await handleTelegramUpdate(message("/top"), deps);
  await handleTelegramUpdate(press("mh:today"), deps);
  assert.deepEqual(seen, ["link:abc", "marathon-link:mth_code", "marathon", "marathon"]);
  const invalid = await handleTelegramUpdate(message("/start bad"), { ...deps, consume: async () => false });
  assert.equal(invalid!.replyMarkup, undefined);
  assert.match(invalid!.text, /недійсне/);
});

test("menu callbacks are acknowledged, identity-checked and edit the menu message in place", async () => {
  const acks: string[] = [];
  const getTasks = async (identity: unknown) => {
    assert.equal(identity, "123");
    return { status: "success" as const, sessions: [{ sessionId: 42, sessionType: 1, themeId: 1, themeName: "Алгебра", status: 2, taskCount: 4, completedTaskCount: 1, expiresAt: 1_900_000_000 }] };
  };
  const deps = { consume: async () => false, referenceSecret: secret, getTasks, getProfile: async () => student, acknowledgeCallback: async (id: string) => { acks.push(id); } };
  const list = await handleTelegramUpdate(press("m:tasks"), deps);
  assert.deepEqual(acks, ["q1"]);
  assert.equal(list!.editMessageId, 77);
  assert.match(list!.text, /Ваші завдання/);
  const rows = list!.replyMarkup!.inline_keyboard;
  assert.equal(resolveTaskReference(rows[0][0].callback_data!.slice(2), "123", secret), 42);
  assert.deepEqual(rows.at(-1)!.map((button) => button.callback_data), ["m:today", "m:home"]);
  // Group chats and buttons pressed by someone other than the chat owner are ignored entirely.
  assert.equal(parseMenuCallback(press("m:tasks", 456, 123)), null);
  assert.equal(parseMenuCallback(press("m:tasks", 123, -100, "group")), null);
  assert.equal(await handleTelegramUpdate(press("m:tasks", 123, -100, "group"), deps), null);
  // Unknown or outdated buttons get a safe reply with a way back.
  for (const data of ["m:nope", "m:", "p:t:zz", "p:q:9", `m:${"x".repeat(80)}`]) {
    const reply = await handleTelegramUpdate(press(data), deps);
    assert.match(reply!.text, /застаріла/);
    assert.equal(reply!.replyMarkup!.inline_keyboard[0][0].callback_data, "m:home");
  }
});

test("unlinked users get a linking hint; help stays available; storage errors stay generic", async () => {
  const hint = await handleMenuRequest({ chatId: "1", userId: "1", action: { kind: "screen", screen: "stats" } }, { getProfile: async () => notLinked, getStats: async () => { assert.fail("no stats without a link"); } });
  assert.match(hint.text, /підключіть Telegram/);
  assert.match(hint.replyMarkup!.inline_keyboard[0][0].url!, /\/account$/);
  const help = await handleMenuRequest({ chatId: "1", userId: "1", action: { kind: "screen", screen: "help" } }, { getProfile: async () => notLinked });
  assert.match(help.text, /\/tasks/);
  const failed = await handleMenuRequest({ chatId: "1", userId: "1", action: { kind: "screen", screen: "home" } }, { getProfile: async () => ({ status: "error", code: "databaseFailure" }) });
  assert.doesNotMatch(failed.text, /database|SQL|error/i);
});

test("/stats shows only the verified account's statistics without internal identifiers", async () => {
  const owners: number[] = [];
  const reply = await handleTelegramUpdate(message("/stats"), {
    consume: async () => false,
    getProfile: async () => student,
    menu: { getStats: async (userId) => {
      owners.push(userId);
      return { completedSessions: 3, averagePercent: 61.5, recent: [{ topic: "Алгебра", score: 80 }], topics: [{ name: "Алгебра", percent: 80, lastPercent: 90 }, { name: "Геометрія", percent: 43, lastPercent: null }], weakest: [{ name: "Геометрія", percent: 43 }] };
    } },
  });
  assert.deepEqual(owners, [7]);
  assert.match(reply!.text, /Завершено сесій: <b>3<\/b>/);
  assert.match(reply!.text, /Середній результат: <b>62%<\/b>/);
  assert.match(reply!.text, /🟢 Алгебра — 80% \(остання спроба 90%\)/);
  assert.match(reply!.text, /Варто підтягнути[\s\S]*Геометрія — 43%/);
  assert.doesNotMatch(reply!.text, /\b7\b|userId|sessionId/);
});

test("teacher-only and student-only options follow the verified role", async () => {
  const prefs = prefsConnection();
  const studentSummary = await handleMenuRequest({ chatId: "123", userId: "123", action: { kind: "screen", screen: "stud" } }, { getProfile: async () => student, getConnection: prefs.getConnection });
  assert.match(studentSummary.text, /лише вчителям/);
  const summary = await handleMenuRequest({ chatId: "555", userId: "555", action: { kind: "screen", screen: "stud" } }, { getProfile: async () => teacher, getConnection: prefs.getConnection, nowSec: () => 1_800_000_000 });
  assert.match(summary.text, /Мої учні[\s\S]*Алгебра[\s\S]*Завершили: 1\/3/);
  const rejected = await handleMenuRequest({ chatId: "555", userId: "555", action: { kind: "toggle", key: "new" } }, { getProfile: async () => teacher, getConnection: prefs.getConnection });
  assert.match(rejected.text, /застаріла/);
  assert.equal(prefs.writes.length, 0);
  assert.deepEqual(togglesForRole("student"), ["new", "dl", "day"]);
  assert.deepEqual(togglesForRole("teacher"), ["tr", "td"]);
});

test("notification preferences are scoped to the account, validated and atomically toggled", async () => {
  const prefs = prefsConnection();
  const deps = { getProfile: async () => student, getConnection: prefs.getConnection };
  const screen = await handleMenuRequest({ chatId: "123", userId: "123", messageId: 9, action: { kind: "screen", screen: "notif" } }, deps);
  assert.match(screen.text, /✅ Нові завдання/);
  assert.equal(screen.editMessageId, 9);
  const toggled = await handleMenuRequest({ chatId: "123", userId: "123", messageId: 9, action: { kind: "toggle", key: "dl" } }, deps);
  assert.match(toggled.text, /❌ Нагадування про терміни/);
  assert.deepEqual(prefs.writes[0].params, [1, 0]);
  assert.match(prefs.writes[0].sql, /ON DUPLICATE KEY UPDATE deadline_reminders = 1 - deadline_reminders/);
  await handleMenuRequest({ chatId: "123", userId: "123", action: { kind: "toggle", key: "dl" } }, deps);
  assert.equal(prefs.rows.get(1)!.deadline_reminders, 1);
  const quiet = await handleMenuRequest({ chatId: "123", userId: "123", action: { kind: "quietSet", preset: 1 } }, deps);
  assert.match(quiet.text, /Тихі години: 22:00–08:00/);
  assert.ok(prefs.writes.every((write) => write.params[0] === 1), "only the verified account id is written");
  assert.deepEqual(parseMenuData("p:q:3"), { kind: "quietSet", preset: 3 });
  assert.deepEqual(parseMenuData("p:q:4"), { kind: "stale" });
  assert.deepEqual(parseMenuData("p:t:new"), { kind: "toggle", key: "new" });
  assert.deepEqual(parseMenuData("p:t:constructor"), { kind: "stale" });
  assert.deepEqual(parseMenuData("m:toString"), { kind: "stale" });
});

test("quiet hours handle windows across midnight and same-day windows", () => {
  const overnight = { quietStart: 22, quietEnd: 8 };
  assert.deepEqual([21, 22, 23, 0, 7, 8].map((hour) => isQuietHour(overnight, hour)), [false, true, true, true, true, false]);
  const day = { quietStart: 9, quietEnd: 12 };
  assert.deepEqual([8, 9, 11, 12].map((hour) => isQuietHour(day, hour)), [false, true, true, false]);
  assert.equal(isQuietHour({ quietStart: null, quietEnd: null }, 3), false);
  assert.equal(quietPresetIndex({ quietStart: 23, quietEnd: 7 }), 2);
  assert.equal(quietPresetIndex({ quietStart: 5, quietEnd: 6 }), 0);
  assert.equal(formatQuietHours({ quietStart: 21, quietEnd: 9 }), "21:00–09:00");
});

test("menu commands parse only private messages from the chat owner", () => {
  assert.equal(parseMenuCommand(message("/stats"))?.action.kind, "screen");
  assert.equal(parseMenuCommand(message("/settings@nmt_bot"))?.chatId, "123");
  assert.equal(parseMenuCommand(message("/stats", -1, 123, "group")), null);
  assert.equal(parseMenuCommand(message("/stats", 123, 456)), null);
  assert.equal(parseMenuCommand(message("/stats now")), null);
  assert.equal(parseMenuCommand(message("/tasks")), null);
});
