import assert from "node:assert/strict";
import { test } from "node:test";
import { marathonCallbackFromText, marathonReplyKeyboard } from "@/modules/marathons/daily/botPlay";
import { handleMenuRequest } from "./menu";
import {
  accountCallbackFromText,
  accountInlineKeyboard,
  accountMenuRows,
  accountReplyKeyboard,
  attachReplyKeyboard,
  parsePrivateMenuText,
} from "./replyKeyboard";
import type { TelegramAccountResult } from "./account";
import { handleTelegramUpdate } from "./webhook";
import { mainMenuDataButton, navRow } from "./ui";

const student: TelegramAccountResult = {
  status: "success",
  profile: { accountId: 1, userId: 7, role: "student", displayName: "Іра", linkedAt: 1_800_000_000 },
};
const teacher: TelegramAccountResult = {
  status: "success",
  profile: { accountId: 5, userId: 70, role: "teacher", displayName: "Олег", linkedAt: null },
};

const message = (text: string) => ({ message: { chat: { id: 123, type: "private" }, from: { id: 123 }, text } });
const press = (data: string) => ({
  callback_query: { id: "q1", data, from: { id: 123 }, message: { message_id: 77, chat: { id: 123, type: "private" } } },
});

function labels(rows: { text: string }[][]): string[] {
  return rows.flat().map((button) => button.text);
}

test("reply keyboard repeats the cabinet menu and stays persistent", () => {
  const studentRows = accountMenuRows("student", false, true);
  assert.deepEqual(labels(studentRows), [
    "📚 Мої завдання", "📅 Сьогодні", "📊 Моя статистика", "🔔 Сповіщення", "👤 Мій акаунт", "❓ Допомога", "🏠 Головне меню",
  ]);
  assert.deepEqual(labels(accountMenuRows("teacher", false, true)), [
    "👥 Мої учні", "🔔 Сповіщення", "👤 Мій акаунт", "❓ Допомога", "🏠 Головне меню",
  ]);
  const withMarathon = labels(accountMenuRows("student", true, true));
  assert.equal(withMarathon.includes("🏆 Рейтинг"), true);
  assert.equal(withMarathon.includes("🏁 Марафон"), true);
  assert.equal(withMarathon.includes("Пройти тестування"), false);
  const keyboard = accountReplyKeyboard("student", false);
  assert.equal(keyboard.resize_keyboard, true);
  assert.equal(keyboard.is_persistent, true);
  assert.deepEqual(
    accountInlineKeyboard("teacher", true).flat().map((button) => button.callback_data),
    ["m:stud", "mh:top", "m:notif", "m:acct", "m:help", "mh:menu"],
  );
  assert.equal(accountCallbackFromText("📚 Мої завдання"), "m:tasks");
  assert.equal(accountCallbackFromText("  🏠 Головне меню  "), "m:home");
  assert.equal(accountCallbackFromText("🏁 Марафон"), "mh:menu");
  assert.equal(accountCallbackFromText("Сьогодні"), null);
  assert.deepEqual(mainMenuDataButton(), { text: "🏠 Головне меню", data: "m:home" });
  assert.deepEqual(navRow().map((button) => button.callback_data), ["m:home"]);
});

test("marathon bottom buttons use the same labels as the inline menu", () => {
  const keyboard = marathonReplyKeyboard({ bot_btn_today: "День", bot_btn_top: "Топ" });
  assert.equal(keyboard.resize_keyboard, true);
  assert.equal(keyboard.is_persistent, true);
  assert.deepEqual(keyboard.keyboard.flat().map((button) => button.text), [
    "День", "Топ", "Зупинити сповіщення", "🏠 Головне меню",
  ]);
  assert.equal(keyboard.keyboard.flat().some((button) => button.text === "Пройти тестування"), false);
  assert.equal(marathonCallbackFromText("День", { bot_btn_today: "День" }), "mh:today");
  assert.equal(marathonCallbackFromText("Топ", { bot_btn_top: "Топ" }), "mh:top");
  assert.equal(marathonCallbackFromText("Зупинити сповіщення", undefined), "mh:stop");
  assert.equal(marathonCallbackFromText("🏠 Головне меню", undefined), "m:home");
  assert.equal(marathonCallbackFromText("Пройти тестування", undefined), null);
});

test("the bottom menu is attached without dropping an inline keyboard on another message", () => {
  const packed = attachReplyKeyboard({
    chatId: "1",
    text: "Правила",
    continuation: [{
      chatId: "1",
      text: "Меню",
      replyMarkup: { inline_keyboard: [[{ text: "Карта на сайті", url: "https://nmt.in.ua/map" }]] },
    }],
  }, accountReplyKeyboard("student", false));
  assert.equal(packed.replyKeyboard?.is_persistent, true);
  assert.equal(packed.replyMarkup, undefined);
  assert.equal(packed.continuation?.[0]?.replyMarkup?.inline_keyboard[0]?.[0]?.url, "https://nmt.in.ua/map");
  assert.equal(packed.continuation?.[0]?.replyKeyboard, undefined);
});

test("a bottom button and the main-menu callback open the same screen", async () => {
  const deps = {
    consume: async () => false,
    getProfile: async () => student,
    getTasks: async () => ({ status: "success" as const, sessions: [] }),
    menu: { hasMarathon: async () => false },
    acknowledgeCallback: async () => {},
  };
  const fromText = await handleTelegramUpdate(message("📚 Мої завдання"), deps);
  const fromCallback = await handleTelegramUpdate(press("m:tasks"), deps);
  assert.equal(fromText?.text, "📚 Зараз у вас немає актуальних завдань.");
  assert.equal(fromText?.text, fromCallback?.text);
  const homeText = await handleTelegramUpdate(message("🏠 Головне меню"), deps);
  const homeCallback = await handleMenuRequest(
    { chatId: "123", userId: "123", action: { kind: "screen", screen: "home" } },
    { getProfile: async () => student, hasMarathon: async () => false },
  );
  assert.equal(homeText?.text, homeCallback.text);
  assert.match(homeCallback.text, /Вітаємо, Іра/);
  assert.equal(homeCallback.replyKeyboard?.resize_keyboard, true);
  assert.equal(homeCallback.replyKeyboard?.is_persistent, true);
  const bottom = homeCallback.replyKeyboard!.keyboard.flat().map((button) => button.text);
  const inline = homeCallback.replyMarkup!.inline_keyboard.flat().map((button) => button.text);
  assert.deepEqual(bottom, [...inline, "🏠 Головне меню"]);
  const teacherHome = await handleTelegramUpdate(press("m:home"), {
    ...deps,
    getProfile: async () => teacher,
  });
  assert.deepEqual(
    teacherHome?.replyKeyboard?.keyboard.flat().map((button) => button.text),
    ["👥 Мої учні", "🔔 Сповіщення", "👤 Мій акаунт", "❓ Допомога", "🏠 Головне меню"],
  );
  assert.equal(parsePrivateMenuText(message("/start")), null);
  assert.equal(parsePrivateMenuText({ message: { chat: { id: -1, type: "group" }, from: { id: 123 }, text: "📚 Мої завдання" } }), null);
});

test("a marathon bottom label is forwarded to the marathon handler", async () => {
  const seen: string[] = [];
  const reply = await handleTelegramUpdate(message("Сьогодні"), {
    consume: async () => false,
    getProfile: async () => { assert.fail("marathon labels do not open the cabinet menu"); },
    marathon: async (update) => {
      const text = (update as { message?: { text?: string } }).message?.text;
      seen.push(text ?? "");
      return { chatId: "123", text: "день марафону" };
    },
  });
  assert.deepEqual(seen, ["Сьогодні"]);
  assert.equal(reply?.text, "день марафону");
  assert.equal(await handleTelegramUpdate(message("привіт"), {
    consume: async () => false,
    marathon: async () => null,
  }), null);
});

test("linking an account shows the bottom menu", async () => {
  const reply = await handleTelegramUpdate(message("/start abc"), {
    consume: async () => true,
    getProfile: async () => student,
    menu: { hasMarathon: async () => true },
  });
  assert.match(reply!.text, /успішно/);
  assert.equal(reply!.replyMarkup!.inline_keyboard[0]![0]!.callback_data, "m:home");
  assert.equal(reply!.replyKeyboard?.is_persistent, true);
  const bottom = reply!.replyKeyboard!.keyboard.flat().map((button) => button.text);
  assert.equal(bottom.includes("🏁 Марафон"), true);
  assert.equal(bottom.includes("🏠 Головне меню"), true);
  assert.equal(bottom.includes("Пройти тестування"), false);
});
