import assert from "node:assert/strict";
import test from "node:test";
import { piecesToReplies } from "@/modules/telegram/deliver";
import { composeRichText, composeTelegramTask } from "@/modules/telegram/taskRender";
import { telegramHtmlToPlain } from "@/modules/telegram/telegramHtml";
import {
  expandSources,
  introSources,
  materialSources,
  optionLabel,
  previewChat,
  type RichSource,
} from "./telegramContent";

const SITE = "https://nmt.in.ua/marathon/math-5/day/1";

function taskSource(): RichSource {
  return {
    text: "Обчисліть $x^2$\n1. 1\n2. 4",
    rich: true,
    buttons: [
      { text: "1. 1", data: "mh:z:opaqueToken01" },
      { text: "2. 4", data: "mh:z:opaqueToken02" },
    ],
    siteUrl: SITE,
    siteLabel: "Відкрити на сайті",
  };
}

test("day material stays in the chat and a formula task keeps opaque buttons", () => {
  const materials = expandSources([
    ...materialSources({
      type: "youtube",
      urlOrBody: "https://www.youtube.com/watch?v=abcdefghijk",
    }),
    ...materialSources({
      type: "text",
      urlOrBody: "Правило **додавання**.\n\n![схема](https://nmt.in.ua/pic.png)",
    }),
    ...materialSources({
      type: "loom",
      urlOrBody: "https://cdn.example.com/lesson.mp4",
    }),
  ]);
  assert.equal(materials[0]?.previewUrl, "https://www.youtube.com/watch?v=abcdefghijk");
  assert.match(materials.map((item) => item.text).join("\n"), /<b>додавання<\/b>/);
  assert.ok(materials.some((item) => item.photoUrl === "https://nmt.in.ua/pic.png"));
  assert.ok(materials.some((item) => item.videoUrl?.endsWith(".mp4")));

  const task = expandSources([taskSource()]);
  assert.equal(task.some((item) => item.formulaTex), false);
  assert.match(task.map((item) => item.text).join("\n"), /Обчисліть x²/);
  const buttons = task[task.length - 1]?.buttons ?? [];
  assert.deepEqual(buttons.map((button) => button.data ?? button.url), [
    "mh:z:opaqueToken01",
    "mh:z:opaqueToken02",
    SITE,
  ]);
  assert.equal(buttons.at(-1)?.text, "Відкрити на сайті");
  const packed = JSON.stringify(buttons);
  assert.equal(packed.includes("correct"), false);
  assert.equal(packed.includes("mh:a:"), false);
  assert.equal(optionLabel("$x^2$", 0), "1. x²");
  assert.ok(optionLabel(`${"$\\frac{a+b}{c}$ ".repeat(30)}`, 0).length <= 64);
  assert.equal(task.some((item) => item.text.trim() === "."), false);
});

test("intro sends the photo with the rules, and a long text follows the photo", () => {
  const short = expandSources(introSources("", "Правила марафону.", "https://nmt.in.ua/api/marathon-media/abc"));
  assert.equal(short[0]?.photoUrl, "https://nmt.in.ua/api/marathon-media/abc");
  assert.match(short[0]?.text ?? "", /Правила марафону/);
  const long = expandSources(introSources(
    "https://www.youtube.com/watch?v=abcdefghijk",
    "Правила",
    "https://nmt.in.ua/pic.png",
  ));
  assert.equal(long[0]?.photoUrl, "https://nmt.in.ua/pic.png");
  assert.equal(long[0]?.text, "");
  assert.ok(long.some((item) => item.previewUrl?.includes("youtube.com")));
});

test("marathon task text keeps comparison signs in the bot and in the preview", () => {
  const sign = composeTelegramTask({
    prompt: "Визначте знак: (8 + 4): 3 □ 2 + 2",
    options: ["≠", "<", "=", ">"],
    optionData: ["mh:a:1:1:1", "mh:a:1:1:2", "mh:a:1:1:3", "mh:a:1:1:4"],
  });
  const replies = piecesToReplies("9", expandSources([sign]));
  assert.equal(replies.length, 1);
  assert.equal(replies[0]?.parseMode, undefined);
  assert.match(replies[0]?.text ?? "", /А\. ≠/);
  assert.match(replies[0]?.text ?? "", /Б\. </);
  assert.match(replies[0]?.text ?? "", /В\. =/);
  assert.match(replies[0]?.text ?? "", /Г\. >/);
  assert.deepEqual(
    replies[0]?.replyMarkup?.inline_keyboard.slice(0, 4).map((row) => row[0]?.text),
    ["А. ≠", "Б. <", "В. =", "Г. >"],
  );

  const rich = piecesToReplies("9", expandSources([{
    text: "Знак 3 < 4 & 5 > 1 і **жирний**",
    rich: true,
  }]));
  assert.equal(rich[0]?.parseMode, "HTML");
  assert.match(rich[0]?.text ?? "", /3 &lt; 4 &amp; 5 &gt; 1/);
  assert.match(rich[0]?.text ?? "", /<b>жирний<\/b>/);
  assert.doesNotMatch(rich[0]?.text ?? "", /3 < 4/);

  const review = piecesToReplies("9", expandSources([composeRichText({
    text: "Правильна відповідь: <\nі ще > та &",
  })]));
  assert.equal(review[0]?.parseMode, undefined);
  assert.match(review[0]?.text ?? "", /Правильна відповідь: </);
  assert.match(review[0]?.text ?? "", /> та &/);

  const bubbles = previewChat({
    introText: "Знак 3 < 4 & 5",
    materials: [],
    tasks: [
      { prompt: "Визначте знак: 7 · 4 □ 35 − 9", options: ["<", ">", "≤", "="] },
      {
        prompt: "Як записати 6 · 4 + 11, якщо d = 6 · 4?\n\nА. d · 11\nБ. d − 11\nВ. d + 11\nГ. d : 11",
        options: ["d · 11", "d − 11", "d + 11", "d : 11"],
      },
    ],
    siteLabel: "Сайт",
  });
  assert.match(telegramHtmlToPlain(bubbles.map((item) => item.body).join("\n")), /3 < 4 & 5/);
  const second = bubbles.find((item) => item.body.includes("7 · 4"));
  assert.ok(second);
  const shown = telegramHtmlToPlain(second.body);
  assert.match(shown, /А\. </);
  assert.match(shown, /Б\. >/);
  assert.match(shown, /В\. ≤/);
  assert.match(shown, /Г\. =/);
  const copied = bubbles.find((item) => item.body.includes("Як записати"));
  assert.ok(copied);
  assert.equal(copied.body.split("А. d · 11").length - 1, 1);
  assert.equal(copied.body.includes("Б. d − 11\nБ. d − 11"), false);
});

test("admin preview shows the day as chat bubbles with a secondary site button", () => {
  const bubbles = previewChat({
    introText: "Сьогодні дроби.",
    materials: [{ type: "youtube", urlOrBody: "https://www.loom.com/share/abcd12345678" }],
    tasks: [{ prompt: "Скільки буде 2+2?", options: ["3", "4"] }],
    siteLabel: "Відкрити на сайті",
  });
  assert.match(bubbles.map((item) => item.body).join("\n"), /Сьогодні дроби/);
  assert.ok(bubbles.some((item) => item.kind === "video" && item.body.includes("loom.com")));
  const task = bubbles.find((item) => item.buttons.includes("А. 3"));
  assert.ok(task);
  assert.equal(task.buttons.includes("Відкрити на сайті"), false);
  assert.deepEqual(task.buttons, ["А. 3", "Б. 4"]);
  assert.match(task.body, /2\+2/);
});
