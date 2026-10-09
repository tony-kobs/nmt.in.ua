import assert from "node:assert/strict";
import test from "node:test";
import {
  expandSources,
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
  const formula = task.find((item) => item.formulaTex === "x^2");
  assert.ok(formula);
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
  assert.equal(optionLabel("$x^2$", 0), "1");
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
  const task = bubbles.find((item) => item.buttons.includes("1. 3"));
  assert.ok(task);
  assert.equal(task.buttons.at(-1), "Відкрити на сайті");
  assert.equal(task.buttons[0], "1. 3");
});
