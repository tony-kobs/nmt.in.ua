import assert from "node:assert/strict";
import test from "node:test";
import { THEME_CODE_ORDER } from "@/modules/testing/workbookTopicMap";
import {
  NMT_TOPICS_PATH,
  clipSentences,
  publicNmtTopicBySlug,
  publicNmtTopicPaths,
  publicNmtTopics,
  slugifyUkTopic,
  textbookIntro,
  topicCtaHref,
  topicPracticePath,
} from "./catalog";

test("public topic pages cover every live theme code once", () => {
  const topics = publicNmtTopics();
  const codes = topics.map((topic) => topic.code);
  assert.equal(codes.includes("MATH-05-ELEM-OPS"), false);
  assert.deepEqual(
    codes,
    THEME_CODE_ORDER.filter((code) => code !== "MATH-05-ELEM-OPS"),
  );
  const slugs = topics.map((topic) => topic.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const slug of slugs) {
    assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(publicNmtTopicBySlug(slug)?.slug, slug);
  }
  assert.equal(publicNmtTopicBySlug("droby")?.code, "ALG-08-FRACTIONS");
  assert.equal(publicNmtTopicBySlug("DROBY")?.code, "ALG-08-FRACTIONS");
  assert.equal(publicNmtTopicPaths()[0], NMT_TOPICS_PATH);
  assert.equal(publicNmtTopicPaths().length, topics.length + 1);
});

test("slugify keeps Ukrainian titles readable and stable", () => {
  assert.equal(slugifyUkTopic("Дроби"), "droby");
  assert.equal(slugifyUkTopic("Комбінаторика. Прогресії"), "kombinatoryka-prohresii");
  assert.equal(slugifyUkTopic("Теорія ймовірностей"), "teoriia-ymovirnostey");
});

test("textbook intro uses the conspect and does not invent a missing theme", () => {
  const fractions = textbookIntro("ALG-08-FRACTIONS");
  assert.ok(fractions && fractions.length >= 80);
  assert.match(fractions, /дроб/i);
  assert.equal(textbookIntro("ALG-08-QUAD-EQ"), null);
  assert.equal(textbookIntro("MATH-05-ELEM-OPS"), null);
  const clipped = clipSentences(`${"Речення про дроби. ".repeat(40)}`, 120);
  assert.ok(clipped.endsWith("."));
  assert.ok([...clipped].length <= 120);
});

test("cabinet link stays on /topic and guests go through register", () => {
  assert.equal(topicPracticePath(12), "/topic?theme=12");
  assert.equal(topicPracticePath(null), "/topic");
  assert.equal(topicCtaHref(4, true), "/topic?theme=4");
  assert.equal(topicCtaHref(4, false), "/register?next=%2Ftopic%3Ftheme%3D4");
  assert.equal(topicCtaHref(null, false), "/register?next=%2Ftopic");
});
