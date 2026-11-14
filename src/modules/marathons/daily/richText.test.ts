import assert from "node:assert/strict";
import test from "node:test";
import { loomEmbedSrc, renderSafeMarkdown, youtubeEmbedSrc } from "./richText";

test("markdown escapes html and keeps a small safe subset", () => {
  const html = renderSafeMarkdown(
    "**<script>alert(1)</script>**\n\n- [сайт](https://nmt.in.ua)\n- *курсив*",
  );
  assert.equal(html.includes("<script>"), false);
  assert.match(html, /<strong>&lt;script&gt;/);
  assert.match(html, /href="https:\/\/nmt\.in\.ua"/);
  assert.match(html, /<em>курсив<\/em>/);
});

test("day intro and materials render headings and bold, not the source marks", () => {
  const html = renderSafeMarkdown(
    "### **Теорема**\n\nОбчисли $x^2$ і \\(2^{4}\\).\n\n**<img src=x onerror=alert(1)>**",
  );
  assert.match(html, /^<h4><strong>Теорема<\/strong><\/h4>/);
  assert.equal(html.includes("###"), false);
  assert.equal(html.includes("**"), false);
  assert.match(html, /<p>Обчисли \$x\^2\$ і \\\(2\^\{4\}\\\)\.<\/p>/);
  assert.equal(html.includes("<img"), false);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test("markdown links stay on http(s) and a quote cannot break out of an attribute", () => {
  const html = renderSafeMarkdown(
    '[зле](javascript:alert(1)) і [ще](https://evil.test/"onclick="alert(1))',
  );
  assert.equal(html.includes("<a"), false);
  assert.equal(html.includes("javascript:"), true);
  assert.match(html, /&quot;onclick=&quot;/);
});

test("video embeds accept only YouTube and Loom ids", () => {
  assert.equal(
    youtubeEmbedSrc("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  );
  assert.equal(
    youtubeEmbedSrc("https://youtu.be/dQw4w9WgXcQ"),
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  );
  assert.equal(youtubeEmbedSrc("https://evil.example/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(
    loomEmbedSrc("https://www.loom.com/share/abcdef1234567890"),
    "https://www.loom.com/embed/abcdef1234567890",
  );
  assert.equal(loomEmbedSrc("https://loom.com.evil/share/abcdef1234567890"), null);
});
