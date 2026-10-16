import assert from "node:assert/strict";
import test from "node:test";
import { channelSavedPath, withSavedFlag } from "./channelPath";
import { COPY_DEFAULTS } from "./copy";
import {
  deliverRegistrationNotice,
  formatMarathonStartDate,
  registrationNoticeDue,
  registrationNoticeText,
  type RegistrationNoticeClaim,
} from "./registrationNotice";

const notice = {
  marathonId: 5,
  userId: 7,
  title: "Дроби",
  startDate: "2026-10-08",
  chatId: "4242",
  copy: null,
};

function memoryClaims() {
  const rows = new Map<string, "open" | "done">();
  const sent: string[] = [];
  const keyOf = (key: RegistrationNoticeClaim) =>
    `${key.marathonId}:${key.userId}:${key.dayNumber}:${key.kind}:${key.channel}`;
  return {
    sent,
    claim: async (key: RegistrationNoticeClaim) => {
      const id = keyOf(key);
      if (rows.has(id)) return "duplicate" as const;
      rows.set(id, "open");
      return "claimed" as const;
    },
    confirm: async (key: RegistrationNoticeClaim) => {
      rows.set(keyOf(key), "done");
    },
    release: async (key: RegistrationNoticeClaim) => {
      rows.delete(keyOf(key));
    },
    send: async (_chatId: string, text: string) => {
      sent.push(text);
      return true;
    },
  };
}

test("registration note uses the editable template and a Ukrainian start date", () => {
  assert.match(formatMarathonStartDate("2026-10-08"), /8 жовтня 2026/);
  assert.equal(formatMarathonStartDate("не дата"), "не дата");
  const text = registrationNoticeText(notice);
  assert.equal(
    text,
    "Ви зареєструвалися на марафон «Дроби». Старт: 8 жовтня 2026. Завдання приходитимуть сюди.",
  );
  assert.match(text, /Завдання приходитимуть сюди/);
  const custom = registrationNoticeText({
    ...notice,
    copy: { bot_registered: "Старт {start_date}: {title}" },
  });
  assert.equal(custom, "Старт 8 жовтня 2026: Дроби");
  assert.match(COPY_DEFAULTS.bot_registered, /\{title\}/);
  assert.match(COPY_DEFAULTS.bot_registered, /\{start_date\}/);
});

test("the note is due on registration or a later bot link, and on a Telegram save only when linked", () => {
  assert.equal(registrationNoticeDue({ event: "register", channel: null, linked: true }), true);
  assert.equal(registrationNoticeDue({ event: "register", channel: null, linked: false }), false);
  assert.equal(registrationNoticeDue({ event: "channel", channel: "telegram", linked: true }), true);
  assert.equal(registrationNoticeDue({ event: "channel", channel: "telegram", linked: false }), false);
  assert.equal(registrationNoticeDue({ event: "channel", channel: "site", linked: true }), false);
  assert.equal(registrationNoticeDue({ event: "link", channel: null, linked: true }), true);
  assert.equal(registrationNoticeDue({ event: "link", channel: "site", linked: false }), false);
});

test("a registration note is sent once and a failed send can be retried", async () => {
  const deps = memoryClaims();
  assert.equal(
    await deliverRegistrationNotice(
      { ...notice, event: "register", channel: null, linked: true },
      deps,
    ),
    "sent",
  );
  assert.equal(deps.sent.length, 1);
  assert.equal(
    await deliverRegistrationNotice(
      { ...notice, event: "channel", channel: "telegram", linked: true },
      deps,
    ),
    "skipped",
  );
  assert.equal(
    await deliverRegistrationNotice(
      { ...notice, event: "link", channel: "telegram", linked: true },
      deps,
    ),
    "skipped",
  );
  assert.equal(deps.sent.length, 1);

  const retry = memoryClaims();
  let fail = true;
  const flaky = {
    ...retry,
    send: async (chatId: string, text: string) => {
      if (fail) return false;
      return retry.send(chatId, text);
    },
  };
  assert.equal(
    await deliverRegistrationNotice(
      { ...notice, event: "register", channel: null, linked: true },
      flaky,
    ),
    "failed",
  );
  assert.equal(retry.sent.length, 0);
  fail = false;
  assert.equal(
    await deliverRegistrationNotice(
      { ...notice, event: "link", channel: null, linked: true },
      flaky,
    ),
    "sent",
  );
  assert.equal(retry.sent.length, 1);
});

test("a thrown telegram send does not escape and leaves the claim free", async () => {
  const deps = memoryClaims();
  let boom = true;
  const result = await deliverRegistrationNotice(
    { ...notice, event: "channel", channel: "telegram", linked: true },
    {
      ...deps,
      send: async () => {
        if (boom) throw new Error("bot down");
        return true;
      },
    },
  );
  assert.equal(result, "failed");
  boom = false;
  assert.equal(
    await deliverRegistrationNotice(
      { ...notice, event: "link", channel: "telegram", linked: true },
      { ...deps, send: async () => true },
    ),
    "sent",
  );
});

test("an unlinked participant and a site channel do not send", async () => {
  const deps = memoryClaims();
  assert.equal(
    await deliverRegistrationNotice(
      { ...notice, event: "register", channel: null, linked: false },
      deps,
    ),
    "skipped",
  );
  assert.equal(
    await deliverRegistrationNotice(
      { ...notice, chatId: null, event: "link", channel: null, linked: true },
      deps,
    ),
    "skipped",
  );
  assert.equal(
    await deliverRegistrationNotice(
      { ...notice, event: "channel", channel: "site", linked: true },
      deps,
    ),
    "skipped",
  );
  assert.equal(deps.sent.length, 0);
});

test("after save the current day opens, otherwise home", () => {
  assert.equal(
    channelSavedPath({ slug: "math-5", dayNumber: 2, dayReady: true }),
    "/marathon/math-5/day/2?saved=1",
  );
  assert.equal(
    channelSavedPath({ slug: "math-5", dayNumber: 2, dayReady: false }),
    "/?saved=1",
  );
  assert.equal(
    channelSavedPath({ slug: " ", dayNumber: 1, dayReady: true }),
    "/?saved=1",
  );
  assert.equal(withSavedFlag("/marathon/math-5/map", true), "/marathon/math-5/map?saved=1");
  assert.equal(withSavedFlag("/account", false), "/account");
});
