import assert from "node:assert/strict";
import test from "node:test";
import { expandSources } from "@/modules/marathons/daily/telegramContent";
import { buildQuizQuestion } from "@/modules/marathons/daily/botQuiz";
import { piecesToReplies } from "./deliver";
import { composeTelegramTask, formulaToPlain } from "./taskRender";

test("simple school formulas become unicode and a practice task is one message", () => {
  assert.equal(formulaToPlain("x^2"), "x²");
  assert.equal(formulaToPlain(String.raw`\frac{2x}{3}`), "2x/3");
  assert.equal(formulaToPlain(String.raw`\dfrac{1}{2}`), "1/2");
  assert.equal(formulaToPlain(String.raw`\begin{cases}x\\y\end{cases}`), null);

  const message = buildQuizQuestion({
    themeName: "Математичні вирази",
    index: 1,
    total: 10,
    prompt: String.raw`Спростіть вираз $\frac{2x+3x}{1}$.`,
    options: ["$5x$", "$6x$", "$x$", "$2x$"],
    sessionId: 9,
    mappingId: 15,
    retry: false,
  });
  const replies = piecesToReplies("7", expandSources([message]));
  assert.equal(replies.length, 1);
  const reply = replies[0]!;
  assert.equal(reply.formulaTex, undefined);
  assert.equal(reply.photoUrl, undefined);
  assert.equal(reply.siteUrl, undefined);
  assert.match(reply.text, /Математичні вирази · 1\/10/);
  assert.match(reply.text, /Спростіть вираз \(2x\+3x\)\/\(1\)\./);
  assert.match(reply.text, /А\. 5x/);
  assert.match(reply.text, /Г\. 2x/);
  assert.equal(reply.text.split("\n").some((line) => line.trim() === "." || /^[АБВГ]\.$/.test(line.trim())), false);
  assert.deepEqual(
    reply.replyMarkup?.inline_keyboard.map((row) => row[0]?.text),
    ["А. 5x", "Б. 6x", "В. x", "Г. 2x", "Меню"],
  );
  assert.equal(reply.replyMarkup?.inline_keyboard.some((row) => row.some((button) => button.url)), false);
  assert.equal(reply.replyMarkup?.inline_keyboard[0]?.[0]?.callback_data, "mh:qa:9:15:1");
});

test("a complex formula is one photo caption and the site link is not shown yet", () => {
  const message = buildQuizQuestion({
    themeName: "Математичні вирази",
    index: 1,
    total: 10,
    prompt: String.raw`Спростіть вираз $\begin{cases}x\\y\end{cases}$.`,
    options: [String.raw`$\begin{matrix}1\end{matrix}$`, "$6x$", "$x$", "$2x$"],
    sessionId: 9,
    mappingId: 15,
    retry: false,
  });
  const replies = piecesToReplies("7", expandSources([message]));
  assert.equal(replies.length, 1);
  const reply = replies[0]!;
  assert.match(reply.formulaTex ?? "", /begin\{cases\}/);
  assert.match(reply.formulaTex ?? "", /begin\{gathered\}/);
  assert.match(reply.formulaTex ?? "", /mathrm\{\(1\)\}/);
  assert.match(reply.text, /Спростіть вираз/);
  assert.match(reply.text, /\(1\) А/);
  assert.equal(reply.text.split("\n").some((line) => /^[АБВГ]\.$/.test(line.trim())), false);
  assert.equal(reply.siteUrl?.endsWith("/session/9"), true);
  assert.equal(reply.replyMarkup?.inline_keyboard.some((row) => row.some((button) => button.url)), false);
  assert.equal(reply.replyMarkup?.inline_keyboard[0]?.[0]?.text, "А");
  assert.equal(reply.replyMarkup?.inline_keyboard[1]?.[0]?.text, "Б. 6x");
});

test("a stored task image is one photo and an unrenderable picture adds one site button", () => {
  const photo = composeTelegramTask({
    heading: "Геометрія · 1/5",
    prompt: "Який графік?\n![](https://nmt.in.ua/pic.png)",
    options: ["пряма", "парабола"],
    optionData: ["mh:qa:1:2:1", "mh:qa:1:2:2"],
    siteUrl: "https://nmt.in.ua/session/1",
    siteLabel: "Відкрити на сайті",
  });
  const replies = piecesToReplies("7", expandSources([photo]));
  assert.equal(replies.length, 1);
  assert.equal(replies[0]?.photoUrl, "https://nmt.in.ua/pic.png");
  assert.match(replies[0]?.text ?? "", /Який графік/);
  assert.match(replies[0]?.text ?? "", /А\. пряма/);
  assert.equal(replies[0]?.replyMarkup?.inline_keyboard.some((row) => row.some((button) => button.url)), false);

  const relative = composeTelegramTask({
    prompt: "Рисунок ![](/nmt/osvita/a.png)",
    options: ["так", "ні"],
    optionData: ["a", "b"],
  });
  assert.match(relative.photoUrl ?? "", /\/nmt\/osvita\/a\.png$/);

  const broken = composeTelegramTask({
    prompt: "Порівняйте ![](not-a-url)",
    options: ["менше", "більше"],
    optionData: ["a", "b"],
    siteUrl: "https://nmt.in.ua/session/3",
    siteLabel: "Відкрити на сайті",
  });
  const brokenReplies = piecesToReplies("7", expandSources([broken]));
  assert.equal(brokenReplies.length, 1);
  assert.equal(brokenReplies[0]?.photoUrl, undefined);
  assert.equal(brokenReplies[0]?.formulaTex, undefined);
  const siteRows = brokenReplies[0]?.replyMarkup?.inline_keyboard.filter((row) => row.some((button) => button.url)) ?? [];
  assert.equal(siteRows.length, 1);
  assert.equal(siteRows[0]?.[0]?.url, "https://nmt.in.ua/session/3");
});
