import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import type { SendMailInput, SendMailResult } from "@/modules/mail/sendMail";
import {
  buildFeedbackAdminLetter,
  feedbackNoticeTitle,
  notifyAdminsOfFeedback,
} from "./notifyAdmins";
import { submitFeedback } from "./submitFeedback";

test("feedback notice title follows score", () => {
  assert.equal(feedbackNoticeTitle(4), "Нова пропозиція");
  assert.equal(feedbackNoticeTitle(5), "Новий відгук");
  const letter = buildFeedbackAdminLetter({
    id: 12,
    score: 3,
    message: "Додайте друк",
    authorName: "Марія",
    authorLogin: "maria",
    guestEmail: null,
    absoluteLink: "https://nmt.in.ua/feedback#fb-12",
  });
  assert.equal(letter.title, "Нова пропозиція");
  assert.equal(letter.kind, "admin.feedback");
  assert.equal(letter.link, "/feedback#fb-12");
  assert.match(letter.body, /Марія \(@maria\): Додайте друк/);
  assert.equal(letter.mailSubject, "Новий відгук / пропозиція — nmt.in.ua");
  assert.match(letter.mailText, /Тип: пропозиція/);
  assert.match(letter.mailText, /https:\/\/nmt\.in\.ua\/feedback#fb-12/);
});

test("notifyAdminsOfFeedback dedupes mail and keeps going when a send throws", async () => {
  const notes: Array<{ userId: number; title: string; link?: string | null }> = [];
  const sent: string[] = [];
  const connection: SqlConnection = {
    beginTransaction: async () => undefined,
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
    query: async <T = unknown>(sql: string) => {
      if (sql.includes("role = 'admin'")) {
        return [
          { id: 1, email: "Admin@example.com" },
          { id: 2, email: "admin@example.com" },
          { id: 3, email: null },
          { id: 4, email: "not-an-email" },
        ] as T[];
      }
      if (sql.includes("display_name")) {
        return [{ display_name: "Гість", login: "guest" }] as T[];
      }
      return [] as T[];
    },
    execute: async () => ({ insertId: 0, affectedRows: 0 }),
  };

  await notifyAdminsOfFeedback(
    {
      id: 9,
      userId: null,
      score: 8,
      message: "Добре",
      email: "guest@example.com",
    },
    {
      getConnection: async () => connection,
      notifyUser: async (input) => {
        notes.push({
          userId: input.userId,
          title: input.title,
          link: input.link,
        });
        if (input.userId === 3) throw new Error("note down");
        return { id: 1, created: true };
      },
      sendMail: async (input: SendMailInput): Promise<SendMailResult> => {
        sent.push(input.to);
        if (input.to === "admin@example.com") throw new Error("brevo down");
        return { ok: true, mode: "log" };
      },
      absoluteLink: (path) => `https://nmt.in.ua${path}`,
    },
  );

  assert.deepEqual(
    notes.map((note) => note.userId),
    [1, 2, 3, 4],
  );
  assert.equal(notes[0]?.title, "Новий відгук");
  assert.equal(notes[0]?.link, "/feedback#fb-9");
  assert.deepEqual(sent, ["admin@example.com"]);
});

test("submitFeedback still returns the id when admin notify throws", async () => {
  const connection: SqlConnection = {
    beginTransaction: async () => undefined,
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
    query: async () => [],
    execute: async (sql) => {
      if (sql.includes("INSERT INTO site_feedback")) {
        return { insertId: 12, affectedRows: 1 };
      }
      return { insertId: 0, affectedRows: 0 };
    },
  };
  const result = await submitFeedback(
    {
      userId: 1,
      sessionId: null,
      score: 4,
      message: "Пропозиція",
      email: null,
      source: "footer",
    },
    {
      getConnection: async () => connection,
      notifyAdmins: async () => {
        throw new Error("notify failed");
      },
    },
  );
  assert.deepEqual(result, { id: 12 });
});
