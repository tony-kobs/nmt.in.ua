import assert from "node:assert/strict";
import test from "node:test";
import katex from "katex";

import { parseMathText } from "@/components/ui/MathText/parseMathText";
import catalog from "./nmtMatchCatalog.json";
import {
  NMT_MATCH_CHOICES,
  resolveNmtMatch,
  splitNmtMatchEmbed,
} from "./nmtMatch";

const STEM_2026 =
  "Узгодьте вираз (1–3) з тотожно рівним йому виразом (А – Д), якщо $a\\ne 0$.";

test("matching catalog restores the 2026 session-2 expressions hidden by the importer", () => {
  const view = resolveNmtMatch({
    name: "НМТ 2026 · 2 сесія · №17",
    taskText: STEM_2026,
    taskKind: "match",
    answers: ["А", "Б", "В", "Г", "Д"].map((text, index) => ({
      number: index + 1,
      text,
    })),
  });

  assert.ok(view);
  assert.equal(view.stem, STEM_2026);
  assert.equal(view.match.leftTitle, "Вираз");
  assert.equal(view.match.rightTitle, "Тотожно рівний вираз");
  assert.match(view.match.left[0] ?? "", /\\sqrt\[\\scriptstyle 3\]/);
  assert.match(view.match.left[2] ?? "", /\(a-3\)\^2/);
  assert.deepEqual(
    view.match.right.map((option) => option.label),
    ["А", "Б", "В", "Г", "Д"],
  );
  assert.deepEqual(
    view.match.right.map((option) => option.value),
    NMT_MATCH_CHOICES.map((choice) => choice.value),
  );
  assert.match(view.match.right[0]?.text ?? "", /\$-3a\$/);
  assert.match(view.match.right[1]?.text ?? "", /dfrac 3a/);
  assert.doesNotMatch(JSON.stringify(view), /1b;2d;3a/);
});

test("matching catalog restores 2023 sentence beginnings and endings", () => {
  const view = resolveNmtMatch({
    name: "НМТ 2023 · 2 сесія · №16",
    taskText: "Доберіть до кожного початку речення його закінчення.",
    taskKind: "match",
    answers: [{ number: 1, text: "А" }],
  });

  assert.ok(view);
  assert.match(view.match.left[0] ?? "", /sqrt\{x\+1\}/);
  assert.match(view.match.right[4]?.text ?? "", /додатних/);
  assert.equal(view.match.right[0]?.label, "А");
});

test("stored option text wins over the catalog, and an embed wins over both", () => {
  const fromBank = resolveNmtMatch({
    name: "НМТ 2026 · 2 сесія · №17",
    taskText: "Умова",
    taskKind: "match",
    answers: ["$x$", "$y$", "$z$", "$u$", "$v$"].map((text, index) => ({
      number: index + 1,
      text,
    })),
  });
  assert.equal(fromBank?.match.right[0]?.text, "$x$");
  assert.match(fromBank?.match.left[0] ?? "", /sqrt/);

  const raw = [
    "Нова умова",
    "",
    "[[nmt-match]]",
    JSON.stringify({
      leftTitle: "Ліворуч",
      rightTitle: "Праворуч",
      left: ["$1$", "$2$", "$3$"],
      right: ["$a$", "$b$", "$c$", "$d$", "$e$"],
    }),
    "[[/nmt-match]]",
  ].join("\n");
  const fromEmbed = resolveNmtMatch({
    name: "НМТ 2026 · 2 сесія · №17",
    taskText: raw,
    taskKind: "match",
    answers: [{ number: 1, text: "$x$" }],
  });
  assert.equal(fromEmbed?.stem, "Нова умова");
  assert.equal(fromEmbed?.match.leftTitle, "Ліворуч");
  assert.equal(fromEmbed?.match.left[1], "$2$");
  assert.equal(fromEmbed?.match.right[4]?.text, "$e$");
  assert.equal(splitNmtMatchEmbed(raw).embed !== null, true);
});

test("a topic task is not treated as a matching item", () => {
  assert.equal(
    resolveNmtMatch({
      name: "Лінійні рівняння",
      taskText: "Розвʼяжіть $x+1=2$.",
      answers: [{ number: 1, text: "$1$" }],
      taskKind: "mcq",
    }),
    null,
  );
});

test("every catalog formula renders in KaTeX", () => {
  const failures: string[] = [];
  for (const [name, entry] of Object.entries(catalog)) {
    const chunks = [entry.leftTitle, entry.rightTitle, ...entry.left, ...entry.right];
    for (const chunk of chunks) {
      for (const part of parseMathText(chunk)) {
        if (part.type !== "formula") continue;
        try {
          const html = katex.renderToString(part.content, {
            displayMode: part.displayMode,
            output: "html",
            throwOnError: true,
            strict: "ignore",
            trust: false,
          });
          assert.doesNotMatch(html, /katex-error/);
        } catch (error) {
          failures.push(`${name}: ${part.content} (${error instanceof Error ? error.message : error})`);
        }
      }
    }
  }
  assert.deepEqual(failures, []);
});
