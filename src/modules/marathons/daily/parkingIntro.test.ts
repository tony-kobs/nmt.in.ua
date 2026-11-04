import assert from "node:assert/strict";
import test from "node:test";
import { parkingIntro } from "./parkingIntro";

const TOKEN = "ab".repeat(16);

test("parking intro keeps the photo url, the title as alt, and hides an empty photo", () => {
  const withPhoto = parkingIntro({
    title: "  GoIT  ",
    description: "",
    introVideoUrl: "",
    introImageUrl: `/api/marathon-media/${TOKEN}`,
    rules: "",
  });
  assert.equal(withPhoto.imageUrl, `/api/marathon-media/${TOKEN}`);
  assert.equal(withPhoto.imageAlt, "GoIT");
  assert.equal(withPhoto.videoSrc, null);
  assert.equal(withPhoto.description, "");
  assert.equal(withPhoto.rulesHtml, "");

  const bare = parkingIntro({
    title: "GoIT",
    description: "  ",
    introVideoUrl: "   ",
    introImageUrl: "  ",
  });
  assert.equal(bare.imageUrl, null);
  assert.equal(bare.description, "");
  assert.equal(bare.videoSrc, null);
  assert.equal(bare.rulesHtml, "");
});

test("parking intro embeds YouTube and Loom the same way as the map and drops other urls", () => {
  const youtube = parkingIntro({
    title: "GoIT",
    description: "Короткий опис",
    introVideoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  });
  assert.equal(youtube.videoSrc, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal(youtube.description, "Короткий опис");

  const loom = parkingIntro({
    title: "GoIT",
    description: "",
    introVideoUrl: "https://www.loom.com/share/abcdef1234567890",
  });
  assert.equal(loom.videoSrc, "https://www.loom.com/embed/abcdef1234567890");

  const other = parkingIntro({
    title: "GoIT",
    description: "",
    introVideoUrl: "https://example.com/clip",
  });
  assert.equal(other.videoSrc, null);
});

test("parking rules use the map markdown and the visitor name", () => {
  const html = parkingIntro({
    title: "GoIT",
    description: "Опис лишається текстом",
    introVideoUrl: "",
    rules: "Вітаємо, {name}!\n\n- [сайт](https://nmt.in.ua)\n- **<b>жирний</b>**",
    name: "Марія",
  }).rulesHtml;
  assert.match(html, /Вітаємо, Марія!/);
  assert.match(html, /href="https:\/\/nmt\.in\.ua"/);
  assert.match(html, /<strong>&lt;b&gt;жирний&lt;\/b&gt;<\/strong>/);
  assert.equal(html.includes("<b>"), false);

  const guest = parkingIntro({
    title: "GoIT",
    description: "",
    introVideoUrl: "",
    rules: "Вітаємо, {name}!",
    name: "  ",
  }).rulesHtml;
  assert.match(guest, /Вітаємо, учаснику!/);
});
