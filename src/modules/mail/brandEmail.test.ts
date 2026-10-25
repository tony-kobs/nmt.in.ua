import assert from "node:assert/strict";
import test from "node:test";

import {
  EMAIL_CTA_LABEL,
  EMAIL_DAY_BADGE,
  EMAIL_FINAL_GREETING,
  EMAIL_KICKER,
  renderMarathonEmail,
  splitMailBody,
} from "./brandEmail";
import { marathonInviteLetter, marathonMail, wrapMarathonMail } from "@/modules/marathons/daily/mailCopy";

const DAY = "https://nmt.in.ua/marathon/math-5/day/2";
const UNSUB = "https://nmt.in.ua/api/marathon/unsubscribe?m=1&u=2&t=ab";

function shell(html: string) {
  assert.match(html, /#efe8d7/i);
  assert.match(html, /#fdfbf4/i);
  assert.match(html, /#f3ecdb/i);
  assert.match(html, /#d2c7ae/i);
  assert.match(html, /border-radius:\s*20px/);
  assert.match(html, /max-width:\s*560px/);
  assert.match(html, /levelup-book\.png/);
  assert.match(html, new RegExp(EMAIL_KICKER));
  assert.match(html, /Georgia/);
  assert.match(html, /#55503f/i);
  assert.match(html, /role="presentation"/);
  assert.doesNotMatch(html, /#(?:ff0000|dc2626|b91c1c|e11d48)/i);
  assert.doesNotMatch(html, /color:\s*red/i);
}

test("splitMailBody lifts a standalone link and keeps the words", () => {
  const parts = splitMailBody("Відкрито день 2: Дроби\n" + DAY);
  assert.equal(parts.title, "Відкрито день 2: Дроби");
  assert.equal(parts.lead, "");
  assert.equal(parts.href, DAY);
});

test("day open uses the green badge and leaves the plain text alone", () => {
  const rendered = `Відкрито день 2: Дроби\n${DAY}`;
  const mail = wrapMarathonMail({ rendered, unsubscribeUrl: UNSUB, kind: "day_open" });
  assert.equal(mail.subject, "Відкрито день 2: Дроби");
  assert.equal(
    mail.text,
    `${rendered}\n\nВідписатися від листів марафону: ${UNSUB}`,
  );
  assert.equal(mail.text.includes(EMAIL_DAY_BADGE), false);
  shell(mail.html);
  assert.match(mail.html, new RegExp(`>${EMAIL_DAY_BADGE}<`));
  assert.match(mail.html, /#1f8f45/i);
  assert.match(mail.html, /#2aa353/i);
  assert.match(mail.html, /#14713a/i);
  assert.match(mail.html, new RegExp(EMAIL_CTA_LABEL));
  assert.match(mail.html, new RegExp(DAY.replaceAll("/", "\\/")));
  assert.match(mail.html, /unsubscribe\?m=1&amp;u=2&amp;t=ab/);
  assert.doesNotMatch(mail.html, /🏅/);
});

test("reminder stays calm: no badge, no medal, no alarm color", () => {
  const mail = wrapMarathonMail({
    rendered: `Нагадування: день 2 (Дроби) ще не завершено.\n${DAY}`,
    unsubscribeUrl: null,
    kind: "reminder",
  });
  shell(mail.html);
  assert.match(mail.html, /font-weight:400/);
  assert.doesNotMatch(mail.html, new RegExp(`>${EMAIL_DAY_BADGE}<`));
  assert.doesNotMatch(mail.html, /🏅/);
  assert.match(mail.html, /Вимкнути листи можна в кабінеті марафону\./);
  assert.match(mail.text, /Вимкнути листи можна в кабінеті марафону\./);
});

test("final adds a festive strip and a short greeting without rewriting the letter", () => {
  const rendered = `Олена, це був останній день. Підсумок марафону:\nhttps://nmt.in.ua/marathon/math-5/final`;
  const mail = wrapMarathonMail({ rendered, unsubscribeUrl: UNSUB, kind: "final" });
  assert.equal(mail.text.startsWith("Олена, це був останній день."), true);
  assert.equal(mail.text.includes(EMAIL_FINAL_GREETING), false);
  shell(mail.html);
  assert.match(mail.html, /🏅/);
  assert.match(mail.html, /π/);
  assert.match(mail.html, new RegExp(EMAIL_FINAL_GREETING));
  assert.doesNotMatch(mail.html, new RegExp(`>${EMAIL_DAY_BADGE}<`));
  assert.match(mail.html, /linear-gradient\(90deg,#2aa353,#14713a\)/);
});

test("a letter without a link has no button, and tags in the copy stay text", () => {
  const mail = wrapMarathonMail({
    rendered: "Молодець, Олена! Нове місце — 2. <script>alert(1)</script>",
    unsubscribeUrl: UNSUB,
    kind: "rank",
  });
  shell(mail.html);
  assert.doesNotMatch(mail.html, new RegExp(EMAIL_CTA_LABEL));
  assert.match(mail.html, /Молодець, Олена!/);
  assert.match(mail.html, /&lt;script&gt;/);
  assert.doesNotMatch(mail.html, /<script>/i);
});

test("the dedicated day and reminder builders use the same shell", () => {
  const open = marathonMail({
    kind: "day_open",
    title: "П'ять днів",
    dayNumber: 2,
    topic: "Дроби",
    dayUrl: DAY,
    unsubscribeUrl: null,
  });
  assert.match(open.subject, /Відкрито день 2: Дроби/);
  assert.match(open.text, /У марафоні «П'ять днів» відкрився день 2 — Дроби\./);
  assert.match(open.html, new RegExp(`>${EMAIL_DAY_BADGE}<`));
  const reminder = marathonMail({
    kind: "reminder",
    title: "П'ять днів",
    dayNumber: 2,
    topic: "Дроби",
    dayUrl: DAY,
    unsubscribeUrl: null,
  });
  assert.doesNotMatch(reminder.html, new RegExp(`>${EMAIL_DAY_BADGE}<`));
  assert.match(reminder.html, /ще не завершено/);
});

test("an activation invite keeps its sentence and wears the shell", () => {
  const letter = marathonInviteLetter({
    body: "Марафон «П'ять днів» уже активний. Можна приєднатися або відмовитися.",
    link: "https://nmt.in.ua/marathon/math-5",
  });
  assert.equal(
    letter.text,
    "Марафон «П'ять днів» уже активний. Можна приєднатися або відмовитися.\nhttps://nmt.in.ua/marathon/math-5",
  );
  shell(letter.html);
  assert.match(letter.html, new RegExp(EMAIL_CTA_LABEL));
  assert.doesNotMatch(letter.html, new RegExp(`>${EMAIL_DAY_BADGE}<`));
  assert.doesNotMatch(letter.html, /🏅/);
});

test("renderMarathonEmail escapes a title that is only markup", () => {
  const html = renderMarathonEmail({
    body: "<b>день</b>\nhttps://nmt.in.ua/marathon/x",
    tone: "day_open",
    unsubscribeUrl: null,
    logoUrl: "https://nmt.in.ua/brand/levelup-book.png",
  });
  assert.match(html, /&lt;b&gt;день&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>день<\/b>/);
});
