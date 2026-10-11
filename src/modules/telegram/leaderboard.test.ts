import assert from "node:assert/strict";
import { test } from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import type { MarathonLeaderboardRow, MarathonLeaderboardView } from "@/modules/marathons/types";
import type { TelegramAccountResult } from "./account";
import { buildLeaderboardScreen, formatStudentLeaderboard, formatTeacherLeaderboard } from "./leaderboard";
import { handleMenuRequest, parseMenuCallback, parseMenuCommand, parseMenuData } from "./menu";
import { handleTelegramUpdate } from "./webhook";

const student: TelegramAccountResult = { status: "success", profile: { accountId: 1, userId: 7, role: "student", displayName: "Іра", linkedAt: null } };
const teacher: TelegramAccountResult = { status: "success", profile: { accountId: 5, userId: 70, role: "teacher", displayName: "Олег", linkedAt: null } };
const notLinked: TelegramAccountResult = { status: "error", code: "notLinked" };

const message = (text: string, chat = 123, from = 123, type = "private") => ({ message: { chat: { id: chat, type }, from: { id: from }, text } });
const press = (data: string, from = 123, chat = 123, type = "private") => ({
  callback_query: { id: "q1", data, from: { id: from }, message: { message_id: 77, chat: { id: chat, type } } },
});

const marathon = { id: 4, slug: "autumn-2026", title: "Осінній <марафон>", description: null, status: "active" as const, starts_at: 1_790_000_000, ends_at: 1_800_000_000, min_tasks_per_session: 5 };

function row(rank: number, userId: number, extra: Partial<MarathonLeaderboardRow> = {}): MarathonLeaderboardRow {
  return { rank, userId, displayName: `Учень ${userId}`, login: `secret_login_${userId}`, sessionsCount: 2, avgPercent: 100 - rank, avgSecPerTask: 30 + rank, isCurrentUser: false, isRosterStudent: false, ...extra };
}

/** 12 participants; ids 101..111 lead, the viewer (7) is last with no counted sessions. */
function view(options: { viewer?: number; roster?: number[] } = {}): MarathonLeaderboardView {
  const roster = new Set(options.roster ?? []);
  const rows = [...Array.from({ length: 11 }, (_, index) => row(index + 1, 101 + index)), row(12, 7, { sessionsCount: 0, avgPercent: null, avgSecPerTask: null })]
    .map((item) => ({ ...item, isCurrentUser: item.userId === options.viewer, isRosterStudent: roster.has(item.userId) }));
  const current = rows.find((item) => item.isCurrentUser);
  return { marathon, rows, participantCount: rows.length, isParticipant: Boolean(current), currentUserRank: current?.rank ?? null, rosterParticipantCount: rows.filter((item) => item.isRosterStudent).length, rosterSize: roster.size };
}

const lbRequest = (userId = "123", messageId?: number) => ({ chatId: userId, userId, ...(messageId ? { messageId } : {}), action: { kind: "screen" as const, screen: "lb" as const } });

test("student leaderboard: marathon, top 10, own position outside the top and total, no logins or ids", async () => {
  const viewers: number[] = [];
  const reply = await handleMenuRequest(lbRequest("123", 9), {
    getProfile: async () => student,
    leaderboard: { getLeaderboard: async (viewerUserId, options) => { viewers.push(viewerUserId); assert.equal(options.rosterStudentIds, undefined); return view({ viewer: 7 }); } },
  });
  assert.deepEqual(viewers, [7], "the viewer id comes from the verified account, never from Telegram");
  assert.equal(reply.editMessageId, 9);
  assert.equal(reply.parseMode, "HTML");
  assert.match(reply.text, /Осінній &lt;марафон&gt;/);
  assert.match(reply.text, /Учасників: 12/);
  assert.match(reply.text, /Ваше місце: <b>12<\/b> з 12/);
  assert.match(reply.text, /Топ-10/);
  assert.match(reply.text, /🥇 Учень 101 — 99% · 31,0 с\/завд\. · сесій: 2/);
  assert.match(reply.text, /10\. Учень 110/);
  assert.doesNotMatch(reply.text, /Учень 111/, "11th place is not part of the top 10");
  assert.match(reply.text, /…\n12\. <b>Учень 7 \(ви\)<\/b> — ще немає зарахованих сесій/);
  assert.doesNotMatch(reply.text, /secret_login|autumn-2026|\b70\b/);
  const rows = reply.replyMarkup!.inline_keyboard;
  assert.equal(rows[0][0].url, "https://nmt.in.ua/leaderboard");
  assert.deepEqual(rows.slice(1).flat().map((button) => button.callback_data), ["m:lb", "m:home", "m:home"]);
  assert.deepEqual(rows.at(-1)!.map((button) => button.text), ["⬅️ Назад", "🏠 Головне меню"]);
});

test("student inside the top 10 is highlighted once; non-participants get a join hint", () => {
  const leader = formatStudentLeaderboard(view({ viewer: 103 }));
  assert.match(leader, /Ваше місце: <b>3<\/b> з 12/);
  assert.match(leader, /🥉 <b>Учень 103 \(ви\)<\/b>/);
  assert.doesNotMatch(leader, /…/);
  const outsider = formatStudentLeaderboard(view());
  assert.match(outsider, /Ви ще не берете участі/);
  assert.doesNotMatch(outsider, /Ваше місце|\(ви\)/);
  assert.match(outsider, /Топ-10/);
  const empty = formatStudentLeaderboard({ ...view(), rows: [], participantCount: 0 });
  assert.match(empty, /Поки що ніхто не приєднався/);
});

test("no active leaderboard marathon shows a calm empty state with navigation", async () => {
  for (const profile of [student, teacher]) {
    const reply = await handleMenuRequest(lbRequest(), {
      getProfile: async () => profile,
      leaderboard: { getLeaderboard: async () => null, getRosterStudentIds: async () => [7] },
    });
    assert.match(reply.text, /немає активного марафону/);
    assert.equal(reply.replyMarkup!.inline_keyboard.at(-1)!.at(-1)!.callback_data, "m:home");
  }
});

test("teacher leaderboard lists only their roster students, counts others and never names them", async () => {
  const calls: { teacher: number; ids: number[] }[] = [];
  const reply = await handleMenuRequest(lbRequest("555"), {
    getProfile: async () => teacher,
    leaderboard: {
      getRosterStudentIds: async (teacherUserId) => { assert.equal(teacherUserId, 70); return [103, 7, 999]; },
      getLeaderboard: async (viewerUserId, options) => {
        const ids = [...options.rosterStudentIds!];
        calls.push({ teacher: viewerUserId, ids });
        return view({ roster: ids });
      },
    },
  });
  assert.deepEqual(calls, [{ teacher: 70, ids: [103, 7, 999] }]);
  assert.match(reply.text, /Усього учасників: 12/);
  assert.match(reply.text, /Ваших учнів у марафоні: <b>2<\/b> з 3/);
  assert.match(reply.text, /🥉 Учень 103/);
  assert.match(reply.text, /12\. Учень 7 — ще немає зарахованих сесій/);
  assert.match(reply.text, /З зарахованими сесіями: 1 з 2/);
  for (const other of [101, 102, 104, 110, 111]) assert.doesNotMatch(reply.text, new RegExp(`Учень ${other}\\b`));
  assert.doesNotMatch(reply.text, /secret_login|999|Ваше місце/);
  assert.equal(reply.replyMarkup!.inline_keyboard[0][0].url, "https://nmt.in.ua/leaderboard");
});

test("teacher with no roster or no joined students sees counts only", () => {
  assert.match(formatTeacherLeaderboard(view(), 0), /немає прив’язаних учнів/);
  assert.doesNotMatch(formatTeacherLeaderboard(view(), 0), /Учень/);
  const none = formatTeacherLeaderboard(view({ roster: [] }), 4);
  assert.match(none, /Ваших учнів у марафоні: <b>0<\/b> з 4[\s\S]*Ніхто з ваших учнів/);
  assert.doesNotMatch(none, /Учень/);
});

test("teacher roster is resolved only for the teacher role", async () => {
  await buildLeaderboardScreen("123", { ...(student as Extract<TelegramAccountResult, { status: "success" }>).profile }, undefined, {
    getRosterStudentIds: async () => assert.fail("students never load a roster"),
    getLeaderboard: async () => view({ viewer: 7 }),
  });
});

test("/leaderboard and the 🏆 button open the screen; unlinked, foreign and group updates are refused", async () => {
  const acks: string[] = [];
  let loads = 0;
  const deps = {
    consume: async () => false,
    getProfile: async () => student,
    acknowledgeCallback: async (id: string) => { acks.push(id); },
    marathon: async () => assert.fail("the leaderboard never reaches the daily marathon bot"),
    menu: { leaderboard: { getLeaderboard: async () => { loads += 1; return view({ viewer: 7 }); } } },
  };
  const command = await handleTelegramUpdate(message("/leaderboard"), deps);
  assert.match(command!.text, /Рейтинг марафону/);
  assert.equal(command!.editMessageId, undefined);
  const withBot = await handleTelegramUpdate(message("/leaderboard@nmt_bot"), deps);
  assert.match(withBot!.text, /Рейтинг марафону/);
  const button = await handleTelegramUpdate(press("m:lb"), deps);
  assert.deepEqual(acks, ["q1"]);
  assert.equal(button!.editMessageId, 77);
  assert.equal(loads, 3, "one leaderboard read per screen");
  // Home menus expose the button for both roles.
  const home = await handleMenuRequest({ chatId: "123", userId: "123", action: { kind: "screen", screen: "home" } }, { getProfile: async () => student });
  assert.ok(home.replyMarkup!.inline_keyboard.flat().some((item) => item.text === "🏆 Рейтинг" && item.callback_data === "m:lb"));
  const teacherHome = await handleMenuRequest({ chatId: "555", userId: "555", action: { kind: "screen", screen: "home" } }, { getProfile: async () => teacher });
  assert.ok(teacherHome.replyMarkup!.inline_keyboard.flat().some((item) => item.callback_data === "m:lb"));
  // Unlinked: linking hint, no data read.
  const unlinked = await handleTelegramUpdate(message("/leaderboard"), { ...deps, getProfile: async () => notLinked });
  assert.match(unlinked!.text, /підключіть Telegram/);
  assert.equal(loads, 3);
  // Someone else's button, group chats and extra arguments are ignored.
  assert.equal(parseMenuCallback(press("m:lb", 456, 123)), null);
  assert.equal(await handleTelegramUpdate(press("m:lb", 123, -100, "group"), deps), null);
  assert.equal(parseMenuCommand(message("/leaderboard", -100, 123, "group")), null);
  assert.equal(parseMenuCommand(message("/leaderboard all")), null);
  assert.deepEqual(parseMenuData("m:lb"), { kind: "screen", screen: "lb" });
  assert.deepEqual(parseMenuData("m:lb:7"), { kind: "stale" });
  assert.equal(loads, 3);
});

test("leaderboard failures stay generic and keep the way back", async () => {
  const errors: unknown[] = [];
  const reply = await handleMenuRequest(lbRequest(), {
    getProfile: async () => student,
    logError: (error) => errors.push(error),
    leaderboard: { getLeaderboard: async () => { throw new Error("ER_NO_SUCH_TABLE marathons"); } },
  });
  assert.equal(errors.length, 1);
  assert.doesNotMatch(reply.text, /ER_|marathons|SQL/);
  assert.equal(reply.replyMarkup!.inline_keyboard[0][0].callback_data, "m:home");
});

test("/top and mh: callbacks still go to the daily marathon bot", async () => {
  const seen: string[] = [];
  const deps = {
    consume: async () => false,
    getProfile: async () => student,
    marathon: async (update: unknown) => { seen.push(JSON.stringify(update).includes("/top") ? "top" : "mh"); return [{ chatId: "123", text: "daily" }]; },
    menu: { leaderboard: { getLeaderboard: async () => assert.fail("/top is not the leaderboard marathon") } },
  };
  assert.equal((await handleTelegramUpdate(message("/top"), deps))!.text, "daily");
  assert.equal((await handleTelegramUpdate(press("mh:top"), deps))!.text, "daily");
  assert.deepEqual(seen, ["top", "mh"]);
});

test("the real leaderboard service runs once per screen with a single expiry UPDATE and the Telegram connection", async () => {
  const now = Math.floor(Date.now() / 1000);
  const active = { ...marathon, starts_at: now - 86_400, ends_at: now + 86_400 };
  const archiveUpdates: unknown[][] = [];
  let released = 0;
  let acquired = 0;
  const connection: SqlConnection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {},
    release: () => { released += 1; },
    query: async <T>(sql: string) => {
      if (/SELECT id, slug, title/.test(sql)) return [active] as T[];
      if (sql.includes("FROM marathon_participants")) {
        return [
          { user_id: 7, display_name: "Іра", login: "ira_private", joined_at: now - 86_400 },
          { user_id: 8, display_name: "Петро", login: "petro_private", joined_at: now - 86_400 },
        ] as T[];
      }
      if (sql.includes("FROM task_sessions")) {
        return [
          { user_id: 8, tasks_number: 10, right_number: 9, time: 300, start_time: now - 3_600 },
          { user_id: 7, tasks_number: 10, right_number: 6, time: 200, start_time: now - 3_600 },
          { user_id: 7, tasks_number: 3, right_number: 3, time: 10, start_time: now - 3_000 },
        ] as T[];
      }
      return [] as T[];
    },
    execute: async (sql: string, params: unknown[] = []) => {
      if (/UPDATE marathons SET status = 'archived'/.test(sql)) archiveUpdates.push(params);
      return { insertId: 0, affectedRows: 0 };
    },
  };
  const reply = await handleMenuRequest(lbRequest(), {
    getProfile: async () => student,
    getConnection: async () => { acquired += 1; return connection; },
  });
  assert.equal(archiveUpdates.length, 1, "closeExpiredMarathons runs exactly once per render");
  assert.equal(acquired, released, "every connection is released");
  assert.match(reply.text, /Ваше місце: <b>2<\/b> з 2/);
  assert.match(reply.text, /🥇 Петро — 90% · 30,0 с\/завд\. · сесій: 1/);
  assert.match(reply.text, /🥈 <b>Іра \(ви\)<\/b> — 60% · 20,0 с\/завд\. · сесій: 1/, "short sessions do not count (existing scoring)");
  assert.doesNotMatch(reply.text, /_private/);
});
