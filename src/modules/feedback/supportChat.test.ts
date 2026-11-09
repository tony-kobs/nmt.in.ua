import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import type { SendMailInput, SendMailResult } from "@/modules/mail/sendMail";
import { TELEGRAM_HTML_LIMIT } from "@/modules/telegram/telegramHtml";
import {
  feedbackNoticeTitle,
  feedbackNoticeType,
  notifyAdminsOfFeedback,
  type FeedbackStoredNotice,
} from "./notifyAdmins";
import { submitFeedback } from "./submitFeedback";
import {
  deliverFeedbackToSupportChat,
  feedbackSupportAuthor,
  feedbackSupportHtml,
} from "./supportChat";

const TEAM_ENV = {
  TELEGRAM_SUPPORT_CHAT_ID: "-100555",
  TELEGRAM_BOT_TOKEN: "123:test",
  TELEGRAM_BOT_USERNAME: "nmt_bot",
};

function connectionFor(options: {
  admins?: Array<{ id: number; email: string | null }>;
  author?: {
    display_name: string | null;
    login: string | null;
    email: string | null;
  };
} = {}) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const connection: SqlConnection = {
    beginTransaction: async () => undefined,
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
    query: async <T = unknown>(sql: string) => {
      calls.push({ sql });
      if (sql.includes("role = 'admin'")) return (options.admins ?? []) as T[];
      if (sql.includes("display_name")) {
        return (options.author ? [options.author] : []) as T[];
      }
      return [] as T[];
    },
    execute: async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.includes("INSERT INTO site_feedback")) {
        return { insertId: 12, affectedRows: 1 };
      }
      return { insertId: 0, affectedRows: 1 };
    },
  };
  return { connection, calls };
}

function notifyWith(
  connection: SqlConnection,
  sent: string[],
  supportChat: NonNullable<
    Parameters<typeof notifyAdminsOfFeedback>[1]["supportChat"]
  >,
) {
  return (notice: FeedbackStoredNotice) =>
    notifyAdminsOfFeedback(notice, {
      getConnection: async () => connection,
      notifyUser: async () => ({ id: 1, created: true }),
      sendMail: async (input: SendMailInput): Promise<SendMailResult> => {
        sent.push(input.to);
        return { ok: true, mode: "log" };
      },
      absoluteLink: (path) => `https://nmt.in.ua${path}`,
      supportChat,
    });
}

test("the team message escapes visitor text for HTML and names whoever wrote", () => {
  assert.equal(
    feedbackSupportAuthor({
      authorName: "Марія",
      authorLogin: "maria",
      email: "maria@example.com",
    }),
    "Марія, @maria, maria@example.com",
  );
  assert.equal(
    feedbackSupportAuthor({
      authorName: null,
      authorLogin: null,
      email: null,
    }),
    "Гість",
  );

  const text = feedbackSupportHtml({
    title: feedbackNoticeTitle(3),
    type: feedbackNoticeType(3),
    authorName: "Іра <b>",
    authorLogin: "ira",
    email: "ira@example.com",
    message: "a < b & c\n*жирний*",
    absoluteLink: "https://nmt.in.ua/feedback#fb-12",
  });
  assert.match(text, /<b>Нова пропозиція<\/b>/);
  assert.match(text, /Тип: пропозиція/);
  assert.match(text, /Автор: Іра &lt;b&gt;, @ira, ira@example.com/);
  assert.match(text, /a &lt; b &amp; c\n\*жирний\*/);
  assert.equal(text.includes("<b>"), true);
  assert.equal(text.includes("a < b"), false);
  assert.match(
    text,
    /<a href="https:\/\/nmt\.in\.ua\/feedback#fb-12">https:\/\/nmt\.in\.ua\/feedback#fb-12<\/a>/,
  );

  const empty = feedbackSupportHtml({
    title: feedbackNoticeTitle(8),
    type: feedbackNoticeType(8),
    authorName: null,
    authorLogin: "guest",
    email: null,
    message: "   ",
    absoluteLink: "https://nmt.in.ua/feedback#fb-1",
  });
  assert.match(empty, /<b>Новий відгук<\/b>/);
  assert.match(empty, /Тип: відгук/);
  assert.match(empty, /Автор: @guest/);
  assert.match(empty, /Текст: —/);

  const long = feedbackSupportHtml({
    title: "Нова пропозиція",
    type: "пропозиція",
    authorName: "Марія",
    authorLogin: null,
    email: null,
    message: "<".repeat(3000),
    absoluteLink: "https://nmt.in.ua/feedback#fb-9",
  });
  assert.ok(long.length <= TELEGRAM_HTML_LIMIT);
  assert.equal(long.includes("&lt;"), true);
  assert.equal(long.includes("<".repeat(5)), false);
});

test("a new suggestion is posted to the support chat", async () => {
  const { connection } = connectionFor({
    admins: [{ id: 1, email: "admin@example.com" }],
    author: {
      display_name: "Марія",
      login: "maria",
      email: "maria@example.com",
    },
  });
  const sent: string[] = [];
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const saved = await submitFeedback(
    {
      userId: 7,
      sessionId: null,
      score: 3,
      message: "Додайте друк <script>",
      email: "ignored@example.com",
      source: "footer",
    },
    {
      getConnection: async () => connection,
      notifyAdmins: notifyWith(connection, sent, {
        env: TEAM_ENV,
        request: async (url, init) => {
          calls.push({
            url: String(url),
            body: JSON.parse(String(init?.body)) as Record<string, unknown>,
          });
          return new Response(
            JSON.stringify({ ok: true, result: { message_id: 41 } }),
            { status: 200 },
          );
        },
      }),
    },
  );

  assert.deepEqual(saved, { id: 12 });
  assert.deepEqual(sent, ["admin@example.com"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url.endsWith("/sendMessage"), true);
  assert.equal(calls[0]?.body.chat_id, "-100555");
  assert.equal(calls[0]?.body.parse_mode, "HTML");
  assert.deepEqual(calls[0]?.body.link_preview_options, { is_disabled: true });
  const text = String(calls[0]?.body.text);
  assert.match(text, /<b>Нова пропозиція<\/b>/);
  assert.match(text, /Тип: пропозиція/);
  assert.match(text, /Автор: Марія, @maria, maria@example.com/);
  assert.match(text, /Додайте друк &lt;script&gt;/);
  assert.equal(text.includes("ignored@example.com"), false);
  assert.equal(text.includes("<script>"), false);
  assert.match(text, /https:\/\/nmt\.in\.ua\/feedback#fb-12/);
});

test("a missing support chat id skips telegram and still stores the feedback", async () => {
  const { connection } = connectionFor({
    admins: [{ id: 2, email: "lead@example.com" }],
  });
  const sent: string[] = [];
  const logs: unknown[][] = [];
  let fetches = 0;
  const saved = await submitFeedback(
    {
      userId: null,
      sessionId: null,
      score: 4,
      message: "Потрібен друк",
      email: "guest@example.com",
      source: "footer",
    },
    {
      getConnection: async () => connection,
      notifyAdmins: notifyWith(connection, sent, {
        env: {
          TELEGRAM_BOT_TOKEN: "123:test",
          TELEGRAM_BOT_USERNAME: "nmt_bot",
        },
        request: async () => {
          fetches += 1;
          throw new Error("telegram should not be called");
        },
        log: (...args) => {
          logs.push(args);
        },
      }),
    },
  );

  assert.deepEqual(saved, { id: 12 });
  assert.deepEqual(sent, ["lead@example.com"]);
  assert.equal(fetches, 0);
  assert.deepEqual(logs, [["feedback support chat skipped", "no_chat"]]);
  assert.equal(JSON.stringify(logs).includes("Потрібен друк"), false);
});

test("a telegram error still saves the feedback and sends the email", async () => {
  const { connection, calls } = connectionFor({
    admins: [{ id: 1, email: "admin@example.com" }],
    author: {
      display_name: "Марія",
      login: "maria",
      email: "maria@example.com",
    },
  });
  const sent: string[] = [];
  const logs: unknown[][] = [];
  const saved = await submitFeedback(
    {
      userId: 7,
      sessionId: null,
      score: 2,
      message: "секретний текст учня",
      email: null,
      source: "post_test",
    },
    {
      getConnection: async () => connection,
      notifyAdmins: notifyWith(connection, sent, {
        env: TEAM_ENV,
        request: async () =>
          new Response(
            JSON.stringify({
              ok: false,
              error_code: 400,
              description: "bot token and секретний текст учня",
            }),
            { status: 400 },
          ),
        log: (...args) => {
          logs.push(args);
        },
      }),
    },
  );

  assert.deepEqual(saved, { id: 12 });
  assert.deepEqual(sent, ["admin@example.com"]);
  assert.deepEqual(logs, [["support forward", "rejected"]]);
  const logged = JSON.stringify(logs);
  assert.equal(logged.includes("секретний"), false);
  assert.equal(logged.includes("123:test"), false);
  assert.equal(
    calls.some((call) => call.sql.includes("INSERT INTO site_feedback")),
    true,
  );
});

test("a silent telegram is cut off before the bot's own timeout", async () => {
  const { connection } = connectionFor({});
  const started = Date.now();
  await deliverFeedbackToSupportChat(
    {
      title: "Нова пропозиція",
      type: "пропозиція",
      authorName: "Марія",
      authorLogin: null,
      email: null,
      message: "повільно",
      absoluteLink: "https://nmt.in.ua/feedback#fb-3",
    },
    {
      getConnection: async () => connection,
      timeoutMs: 40,
      env: TEAM_ENV,
      log: () => undefined,
      request: (_url, init) =>
        new Promise((_resolve, reject) => {
          // A ref'd timer keeps the test runner alive. AbortSignal.timeout
          // alone does not, so the assertion below is what proves the cutoff.
          const backup = setTimeout(() => reject(new Error("still open")), 1_000);
          const signal = init?.signal;
          if (!signal) {
            clearTimeout(backup);
            reject(new Error("missing timeout"));
            return;
          }
          if (signal.aborted) {
            clearTimeout(backup);
            reject(signal.reason);
            return;
          }
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(backup);
              reject(signal.reason);
            },
            { once: true },
          );
        }),
    },
  );
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 300, `waited ${elapsed}ms`);
});
