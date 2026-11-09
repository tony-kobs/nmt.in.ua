import assert from "node:assert/strict";
import test from "node:test";

import { absoluteUrl, createPageMetadata } from "@/constants/seo";

import {
  pickTextbookTopic,
  readTextbookTopicParam,
  textbookSitemapPaths,
  textbookTopicMeta,
} from "./topicPage";

const themes = [
  { code: "ALG-08-FRACTIONS", name: "Дроби", description: "Дії зі звичайними дробами." },
  { code: "GEO-07-ELEM-PLAN", name: "Планіметрія", description: "" },
];

test("readTextbookTopicParam keeps one trimmed code", () => {
  assert.equal(readTextbookTopicParam(undefined), null);
  assert.equal(readTextbookTopicParam("  "), null);
  assert.equal(readTextbookTopicParam([" ALG-08-FRACTIONS ", "other"]), "ALG-08-FRACTIONS");
});

test("pickTextbookTopic opens the first theme, then 404s an unknown code", () => {
  const first = pickTextbookTopic(themes, null);
  assert.equal(first.status, "ready");
  if (first.status === "ready") {
    assert.equal(first.active.code, "ALG-08-FRACTIONS");
    assert.equal(first.prev, null);
    assert.equal(first.next?.code, "GEO-07-ELEM-PLAN");
  }

  const second = pickTextbookTopic(themes, "GEO-07-ELEM-PLAN");
  assert.equal(second.status, "ready");
  if (second.status === "ready") {
    assert.equal(second.index, 1);
    assert.equal(second.prev?.code, "ALG-08-FRACTIONS");
    assert.equal(second.next, null);
  }

  assert.equal(pickTextbookTopic(themes, "MATH-05-ELEM-OPS").status, "missing");
  assert.equal(pickTextbookTopic([], "ALG-08-FRACTIONS").status, "missing");
  assert.equal(pickTextbookTopic([], null).status, "empty");
});

test("textbook topic metadata is unique and carries canonical plus hreflang", () => {
  const fractions = textbookTopicMeta(themes[0]!, {
    title: "Підручник",
    description: "Загальний опис",
    namedDescription: "Теорія й формули теми «Дроби»",
  });
  const geometry = textbookTopicMeta(themes[1]!, {
    title: "Підручник",
    description: "Загальний опис",
    namedDescription: "Теорія й формули теми «Планіметрія»",
  });
  const index = textbookTopicMeta(null, {
    title: "Підручник",
    description: "Загальний опис",
    namedDescription: "unused",
  });

  assert.equal(fractions.title, "Дроби");
  assert.equal(fractions.description, "Дроби. Дії зі звичайними дробами.");
  assert.equal(fractions.path, "/materials/textbook?topic=ALG-08-FRACTIONS");
  assert.equal(geometry.description, "Теорія й формули теми «Планіметрія»");
  assert.notEqual(fractions.title, geometry.title);
  assert.notEqual(fractions.description, geometry.description);
  assert.notEqual(fractions.path, geometry.path);
  assert.equal(index.path, "/materials/textbook");

  const meta = createPageMetadata(fractions);
  assert.equal(meta.alternates?.canonical, absoluteUrl(fractions.path));
  assert.deepEqual(meta.alternates?.languages, {
    uk: absoluteUrl(fractions.path),
    en: absoluteUrl(fractions.path),
    de: absoluteUrl(fractions.path),
    "x-default": absoluteUrl(fractions.path),
  });
});

test("textbook sitemap lists each theme once and skips a broken code", () => {
  assert.deepEqual(
    textbookSitemapPaths([
      "ALG-08-FRACTIONS",
      " ALG-08-FRACTIONS ",
      "",
      "GEO-07-ELEM-PLAN",
      "bad code",
      "a/b",
    ]),
    [
      "/materials/textbook?topic=ALG-08-FRACTIONS",
      "/materials/textbook?topic=GEO-07-ELEM-PLAN",
    ],
  );
});
