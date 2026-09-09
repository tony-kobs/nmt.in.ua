import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeNmtComment,
  normalizeNmtRichText,
} from "./normalizeNmtRichText";

test("normalizeNmtRichText converts latex tags with attributes", () => {
  const out = normalizeNmtRichText(
    `Позначте <latex display="block">$$ x\\gt -3 $$</latex> число`,
  );
  assert.match(out, /\$x\\gt -3\$/);
  assert.doesNotMatch(out, /<latex/i);
});

test("normalizeNmtRichText keeps cases environments as display math", () => {
  const out = normalizeNmtRichText(
    `<latex display="block">\\( \\begin{cases} x=1 \\\\ y=2 \\end{cases} \\)</latex>`,
  );
  assert.match(out, /\$\$\\begin\{cases\}/);
  assert.doesNotMatch(out, /\\\(/);
});

test("normalizeNmtRichText strips html and keeps images as markdown", () => {
  const out = normalizeNmtRichText(
    `<strong>Текст</strong> <img src="/nmt/osvita/a.png" alt="" />`,
  );
  assert.equal(out.includes("<strong>"), false);
  assert.match(out, /!\[\]\(\/nmt\/osvita\/a\.png\)/);
});

test("normalizeNmtComment drops theme label noise", () => {
  const out = normalizeNmtComment(
    `<strong>Пояснення</strong> <strong> ТЕМА: Алгебра. Дійсні числа. </strong> Перевірка степеня.`,
  );
  assert.doesNotMatch(out, /ТЕМА/i);
  assert.doesNotMatch(out, /Пояснення/i);
  assert.match(out, /Перевірка степеня/);
});

test("normalizeNmtRichText unwraps nested $$\\(...\\)$$ around cases", () => {
  const raw =
    String.raw`Розв’яжіть систему $$\( \begin{cases} \log_2x =2,\\ y=1. \end{cases} \)$$ далі`;
  const out = normalizeNmtRichText(raw);
  assert.doesNotMatch(out, /\\\(/);
  assert.doesNotMatch(out, /\\\)/);
  assert.match(out, /\$\$\\begin\{cases\}/);
  assert.match(out, /\\end\{cases\}\$\$/);
});

test("normalizeNmtRichText escapes bare percent for KaTeX", () => {
  const out = normalizeNmtRichText("результат 50% від числа");
  assert.match(out, /50\\%/);
});
