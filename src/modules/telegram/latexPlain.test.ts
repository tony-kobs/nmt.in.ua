import assert from "node:assert/strict";
import test from "node:test";
import { expandSources } from "@/modules/marathons/daily/telegramContent";
import { buildQuizQuestion } from "@/modules/marathons/daily/botQuiz";
import { piecesToReplies } from "./deliver";
import { composeRichText, composeTelegramTask } from "./taskRender";
import { formulaToPlain, latexToTelegramPlain } from "./latexPlain";

const EXPLANATION = String.raw`$|\frac32-4|=\frac52$, а $2-\frac35=\frac75$. Добуток $\frac52\cdot\frac75=\frac72$.`;
const EXPLANATION_PLAIN = "|3/2-4|=5/2, а 2-3/5=7/5. Добуток 5/2·7/5=7/2.";

test("the prod explanation is plain text, and the same rules cover school TeX", () => {
  assert.equal(latexToTelegramPlain(EXPLANATION), EXPLANATION_PLAIN);
  assert.equal(latexToTelegramPlain(EXPLANATION), latexToTelegramPlain(EXPLANATION_PLAIN));

  const cases: Array<[string, string]> = [
    [String.raw`\frac{a}{b}`, "a/b"],
    [String.raw`\frac32`, "3/2"],
    [String.raw`\frac{a+b}{c}`, "(a+b)/(c)"],
    [String.raw`\frac{a}{b+c}`, "(a)/(b+c)"],
    [String.raw`\dfrac{1}{2}`, "1/2"],
    [String.raw`\tfrac{3}{4}`, "3/4"],
    [String.raw`1\frac12`, "1 1/2"],
    [String.raw`\cdot`, "·"],
    [String.raw`\times`, "×"],
    [String.raw`\div`, ":"],
    [String.raw`\sqrt{x}`, "√x"],
    [String.raw`\sqrt{x+1}`, "√(x+1)"],
    [String.raw`\sqrt[3]{x}`, "³√x"],
    [String.raw`\sqrt[n]{x}`, "ⁿ√x"],
    [String.raw`\sqrt[3]{x+1}`, "³√(x+1)"],
    [String.raw`\sqrt[12]{x}`, "¹²√x"],
    ["x^2", "x²"],
    ["x^3", "x³"],
    ["x^{10}", "x¹⁰"],
    ["x^{n}", "xⁿ"],
    ["x^{n+1}", "xⁿ⁺¹"],
    ["x^{xy}", "x^(xy)"],
    ["a_2", "a₂"],
    ["a_{n+1}", "aₙ₊₁"],
    ["a_{xy}", "a_(xy)"],
    [String.raw`\le \ge \ne \pm \pi \infty \in \cup \cap`, "≤ ≥ ≠ ± π ∞ ∈ ∪ ∩"],
    [String.raw`\leq \geq \neq`, "≤ ≥ ≠"],
    [String.raw`90\degree`, "90°"],
    [String.raw`180^\circ`, "180°"],
    [String.raw`\left|x\right|`, "|x|"],
    [String.raw`\left(1+\frac{p}{100}\right)`, "(1+p/100)"],
    [String.raw`\text{м}`, "м"],
    [String.raw`\mathrm{sin}`, "sin"],
    [String.raw`\{ \}`, "{ }"],
    [String.raw`\foo`, "foo"],
    [String.raw`\foo{bar}`, "foo{bar}"],
    ["Привіт, {name}. Сьогодні дроби.", "Привіт, {name}. Сьогодні дроби."],
    ["Привіт, {name}. $x^2$", "Привіт, {name}. x²"],
    ["https://nmt.in.ua/marathon/math_day", "https://nmt.in.ua/marathon/math_day"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(latexToTelegramPlain(input), expected, input);
  }
  assert.equal(formulaToPlain(String.raw`\begin{cases}x\\y\end{cases}`), null);
});

test("real question-bank strings become the same plain text the bot should send", () => {
  const bank: Array<[string, string]> = [
    // scripts/sql/028_stage2_task_formats.sql — order_tasks.comments
    [
      String.raw`$3x+5=20 \Rightarrow 3x=20-5 \Rightarrow 3x=15 \Rightarrow x=15:3 \Rightarrow x=5$. Перевірка: $3\cdot5+5=20$.`,
      "3x+5=20 ⇒ 3x=20-5 ⇒ 3x=15 ⇒ x=15:3 ⇒ x=5. Перевірка: 3·5+5=20.",
    ],
    [
      String.raw`$x^2-5x+6=0 \Rightarrow (x-2)(x-3)=0 \Rightarrow x-2=0$ або $x-3=0 \Rightarrow x=2$ або $x=3$. Перевірка: $2^2-5\cdot2+6=0$, $3^2-5\cdot3+6=0$.`,
      "x²-5x+6=0 ⇒ (x-2)(x-3)=0 ⇒ x-2=0 або x-3=0 ⇒ x=2 або x=3. Перевірка: 2²-5·2+6=0, 3²-5·3+6=0.",
    ],
    [
      String.raw`Перевірка: $A(0,-1)$: $2\cdot0-1=-1$ ✓. $C(2,2)$: $2\cdot2-1=3\ne2$ ✗.`,
      "Перевірка: A(0,-1): 2·0-1=-1 ✓. C(2,2): 2·2-1=3≠2 ✗.",
    ],
    [
      String.raw`Збільшення на $p\%$ — це множення на $\left(1+\frac{p}{100}\right)$, а зменшення — на $\left(1-\frac{p}{100}\right)$.`,
      "Збільшення на p% — це множення на (1+p/100), а зменшення — на (1-p/100).",
    ],
    [
      String.raw`Множник дорівнює $1 \pm \frac{p}{100}$ залежно від напрямку зміни.`,
      "Множник дорівнює 1 ± p/100 залежно від напрямку зміни.",
    ],
    [
      String.raw`$p\%=\frac{p}{100}$, тому "$30\%$ від $250$" $=250\cdot0{,}3$.`,
      "p%=p/100, тому \"30% від 250\" =250·0,3.",
    ],
    [
      String.raw`$D=(-4)^2-4\cdot1\cdot3=16-12=4$, $\sqrt{D}=2$. $x=\frac{4\pm2}{2}$, тобто $x_1=3$, $x_2=1$.`,
      "D=(-4)²-4·1·3=16-12=4, √D=2. x=(4±2)/(2), тобто x₁=3, x₂=1.",
    ],
    [
      String.raw`Формула коренів: $x=\frac{-b\pm\sqrt{D}}{2a}$. Тут $a=1$, $b=-4$, $c=3$.`,
      "Формула коренів: x=(-b±√D)/(2a). Тут a=1, b=-4, c=3.",
    ],
    // scripts/sql/032_stage2_bank.sql
    [
      String.raw`Квадрат $a^2$, прямокутник $ab$, трикутник $\dfrac{ah}{2}$, круг $\pi r^2$.`,
      "Квадрат a², прямокутник ab, трикутник ah/2, круг π r².",
    ],
    [
      String.raw`Корені $\dfrac{8\pm2}{2}$, тобто $5$ і $3$.`,
      "Корені (8±2)/(2), тобто 5 і 3.",
    ],
    [
      String.raw`$+25\% \to \times 1{,}25$, $-25\% \to \times 0{,}75$.`,
      "+25% → × 1,25, -25% → × 0,75.",
    ],
    // src/content/learningMaterials/sourceBlocks.ts
    [String.raw`\[\frac{a}{c}+\frac{b}{c}=\frac{a+b}{c}\]`, "a/c+b/c=(a+b)/(c)"],
    [String.raw`\[\frac{a}{b}\cdot \frac{c}{d}=\frac{ac}{bd}\]`, "a/b· c/d=ac/bd"],
    [String.raw`\[\left(\frac{A}{B}\right)^n=\frac{A^n}{B^n}\]`, "(A/B)ⁿ=Aⁿ/Bⁿ"],
    [String.raw`\(\sqrt{\frac{a}{b}}=\frac{\sqrt{a}}{\sqrt{b}}\)`, "√(a/b)=√a/√b"],
    [String.raw`\(-3\times{}4=-12\)`, "-3×4=-12"],
    [String.raw`\(-12\div{}3=-4\)`, "-12:3=-4"],
    [String.raw`\(\sqrt{{a}^{2}}=\left|a\right|\)`, "√a²=|a|"],
    [String.raw`\(S_n=\frac{a_1+a_n}{2}\cdot n\)`, "Sₙ=(a₁+aₙ)/(2)· n"],
    [String.raw`\(\cup ADB=\angle AOB\)`, "∪ ADB=angle AOB"],
    [String.raw`\(\,3 + 5 \cdot 7 - 4\)`, "3 + 5 · 7 - 4"],
  ];
  for (const [input, expected] of bank) {
    const plain = latexToTelegramPlain(input);
    assert.equal(plain, expected, input);
    assert.doesNotMatch(plain, /\\[a-zA-Z]|\$/);
  }
});

test("explanations, reviews, materials and callback labels all use that plain text", () => {
  const card = composeRichText({ text: EXPLANATION });
  assert.equal(card.text, EXPLANATION_PLAIN);
  assert.equal(card.formulaTex, undefined);

  const sent = piecesToReplies("7", [{ text: EXPLANATION, buttons: [{ text: String.raw`$\frac{a+b}{c}$`, data: "mh:a:1" }] }]);
  assert.equal(sent[0]?.text, EXPLANATION_PLAIN);
  assert.equal(sent[0]?.replyMarkup?.inline_keyboard[0]?.[0]?.text, "(a+b)/(c)");
  assert.equal(sent[0]?.replyMarkup?.inline_keyboard[0]?.[0]?.callback_data, "mh:a:1");
  assert.ok((sent[0]?.replyMarkup?.inline_keyboard[0]?.[0]?.text.length ?? 0) <= 64);

  const question = buildQuizQuestion({
    themeName: "Дроби",
    index: 1,
    total: 4,
    prompt: "Далі",
    options: [String.raw`$|\frac32-4|$`, "ні"],
    sessionId: 3,
    mappingId: 8,
    retry: false,
    preface: `Неправильно.\n${EXPLANATION}`,
  });
  assert.match(question.text, /\|3\/2-4\|=5\/2/);
  assert.doesNotMatch(question.text, /\\frac|\$/);
  assert.equal(question.buttons?.[0]?.text, "А. |3/2-4|");
  assert.equal(question.buttons?.[0]?.data, "mh:qa:3:8:1");

  const long = composeTelegramTask({
    prompt: "Оберіть",
    options: [`${String.raw`$\frac{a+b}{c}$ `.repeat(20)}кінець`],
    optionData: ["mh:z:token"],
  });
  const label = long.buttons?.[0]?.text ?? "";
  assert.ok(label.length > 0 && label.length <= 64);
  assert.match(label, /^А\. /);
  assert.doesNotMatch(label, /\\frac|\$/);
  assert.equal(long.buttons?.[0]?.data, "mh:z:token");

  const material = expandSources([{ text: `Правило **додавання**.\n\n${EXPLANATION}`, rich: true }]);
  const html = material.map((piece) => piece.text).join("\n");
  assert.equal(material.some((piece) => piece.formulaTex), false);
  assert.match(html, /<b>додавання<\/b>/);
  assert.match(html, /5\/2·7\/5=7\/2/);
  assert.doesNotMatch(html, /\\frac|\$/);
});
