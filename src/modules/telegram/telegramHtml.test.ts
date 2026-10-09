import assert from "node:assert/strict";
import test from "node:test";
import {
  markdownToTelegramHtml,
  splitTelegramHtml,
  TELEGRAM_HTML_LIMIT,
} from "./telegramHtml";

test("telegram html escapes raw markup and keeps a safe markdown subset", () => {
  const html = markdownToTelegramHtml(
    'Привіт <script>alert(1)</script> і **жирний** та [сайт](https://nmt.in.ua/a?x=1&y=2)\n- перший',
  );
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /<b>жирний<\/b>/);
  assert.match(html, /<a href="https:\/\/nmt\.in\.ua\/a\?x=1&amp;y=2">сайт<\/a>/);
  assert.match(html, /• перший/);
  assert.doesNotMatch(html, /javascript:/);
});

test("telegram html splits on paragraphs under 4096 and does not cut a tag", () => {
  const paragraph = "Абзац з правилом.\n\n".repeat(8);
  const link = "[відкрити день](https://nmt.in.ua/marathon/math-5/day/1)";
  const html = markdownToTelegramHtml(`${paragraph}${link} ${"слово ".repeat(80)}`);
  const chunks = splitTelegramHtml(html, 180);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 180);
    assert.equal((chunk.match(/<a /g) ?? []).length, (chunk.match(/<\/a>/g) ?? []).length);
  }
  assert.ok(chunks.join("").includes("відкрити день"));
  const untouched = splitTelegramHtml("Коротко", TELEGRAM_HTML_LIMIT);
  assert.deepEqual(untouched, ["Коротко"]);
});
