import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { absoluteUrl, sendMail, type SendMailInput, type SendMailResult } from "@/modules/mail/sendMail";
import { notifyUser } from "@/modules/notifications/store";
import { FEEDBACK_COMMENT_BELOW_SCORE } from "./types";

export const FEEDBACK_ADMIN_KIND = "admin.feedback";
export const FEEDBACK_ADMIN_MAIL_SUBJECT =
  "Новий відгук / пропозиція — nmt.in.ua";

const EXCERPT_LEN = 140;

export type FeedbackStoredNotice = {
  id: number;
  userId: number | null;
  score: number;
  message: string | null;
  email: string | null;
};

export type FeedbackAdminLetter = {
  kind: typeof FEEDBACK_ADMIN_KIND;
  title: string;
  body: string;
  link: string;
  mailSubject: string;
  mailText: string;
  mailHtml: string;
};

type AdminRow = { id: number; email: string | null };
type AuthorRow = { display_name: string | null; login: string | null };

export function feedbackNoticeTitle(score: number): string {
  return score < FEEDBACK_COMMENT_BELOW_SCORE
    ? "Нова пропозиція"
    : "Новий відгук";
}

export function feedbackNoticeType(score: number): "відгук" | "пропозиція" {
  return score < FEEDBACK_COMMENT_BELOW_SCORE ? "пропозиція" : "відгук";
}

export function feedbackAuthorLabel(input: {
  authorName: string | null;
  authorLogin: string | null;
  guestEmail: string | null;
}): string {
  const name = input.authorName?.trim() || "";
  const login = input.authorLogin?.trim() || "";
  if (name && login) return `${name} (@${login})`;
  if (name) return name;
  if (login) return `@${login}`;
  const email = input.guestEmail?.trim() || "";
  if (email) return `Гість (${email})`;
  return "Гість";
}

function excerpt(message: string | null): string | null {
  if (!message) return null;
  const flat = message.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  if (flat.length <= EXCERPT_LEN) return flat;
  return `${flat.slice(0, EXCERPT_LEN - 1)}…`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildFeedbackAdminLetter(input: {
  id: number;
  score: number;
  message: string | null;
  authorName: string | null;
  authorLogin: string | null;
  guestEmail: string | null;
  absoluteLink: string;
}): FeedbackAdminLetter {
  const author = feedbackAuthorLabel(input);
  const text = excerpt(input.message);
  const title = feedbackNoticeTitle(input.score);
  const type = feedbackNoticeType(input.score);
  const link = `/feedback#fb-${input.id}`;
  const body = text ? `${author}: ${text}` : `${author}: оцінка ${input.score}/10`;
  const shown = text ?? "—";
  const mailText = [
    `Автор: ${author}`,
    `Тип: ${type}`,
    `Текст: ${shown}`,
    `Посилання: ${input.absoluteLink}`,
  ].join("\n");
  const mailHtml = [
    `<p>Автор: ${escapeHtml(author)}</p>`,
    `<p>Тип: ${escapeHtml(type)}</p>`,
    `<p>Текст: ${escapeHtml(shown)}</p>`,
    `<p><a href="${escapeHtml(input.absoluteLink)}">${escapeHtml(input.absoluteLink)}</a></p>`,
  ].join("");
  return {
    kind: FEEDBACK_ADMIN_KIND,
    title,
    body,
    link,
    mailSubject: FEEDBACK_ADMIN_MAIL_SUBJECT,
    mailText,
    mailHtml,
  };
}

type NotifyDeps = {
  getConnection: () => Promise<SqlConnection>;
  notifyUser?: typeof notifyUser;
  sendMail?: (
    input: SendMailInput,
  ) => Promise<SendMailResult>;
  absoluteLink?: (path: string) => string;
};

const SQL_ADMINS = `
  SELECT id, email
  FROM app_users
  WHERE role = 'admin' AND (is_banned = 0 OR is_banned IS NULL)
`;

const SQL_AUTHOR = `
  SELECT display_name, login
  FROM app_users
  WHERE id = ?
  LIMIT 1
`;

function dedupedEmails(rows: AdminRow[]): string[] {
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const row of rows) {
    const email = row.email?.trim().toLowerCase() ?? "";
    if (!email || seen.has(email)) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return emails;
}

/**
 * In-site note for every admin, plus one letter per distinct admin email.
 * Errors are logged. Callers must still treat the feedback row as saved.
 *
 * Admin alerts ignore `user_channel_preferences`. Category toggles
 * (marathon / news / system, including system email off) do not apply:
 * the bell note and the letter always go.
 */
export async function notifyAdminsOfFeedback(
  input: FeedbackStoredNotice,
  deps: NotifyDeps,
): Promise<void> {
  const connection = await deps.getConnection();
  let admins: AdminRow[] = [];
  let authorName: string | null = null;
  let authorLogin: string | null = null;
  try {
    admins = await connection.query<AdminRow>(SQL_ADMINS, []);
    if (admins.length === 0) return;
    if (input.userId) {
      const authors = await connection.query<AuthorRow>(SQL_AUTHOR, [
        input.userId,
      ]);
      authorName = authors[0]?.display_name ?? null;
      authorLogin = authors[0]?.login ?? null;
    }
  } finally {
    connection.release();
  }

  const linkPath = `/feedback#fb-${input.id}`;
  const toAbsolute = deps.absoluteLink ?? ((path: string) => absoluteUrl(path));
  const letter = buildFeedbackAdminLetter({
    id: input.id,
    score: input.score,
    message: input.message,
    authorName,
    authorLogin,
    guestEmail: input.userId ? null : input.email,
    absoluteLink: toAbsolute(linkPath),
  });

  const tell = deps.notifyUser ?? notifyUser;
  for (const admin of admins) {
    const userId = Number(admin.id);
    if (!Number.isInteger(userId) || userId <= 0) continue;
    try {
      await tell({
        userId,
        kind: letter.kind,
        title: letter.title,
        body: letter.body,
        link: letter.link,
      });
    } catch (error) {
      console.error("notifyAdminsOfFeedback: in-site note failed", {
        userId,
        error,
      });
    }
  }

  const deliver = deps.sendMail ?? sendMail;
  for (const email of dedupedEmails(admins)) {
    try {
      const result = await deliver({
        to: email,
        subject: letter.mailSubject,
        text: letter.mailText,
        html: letter.mailHtml,
      });
      if (!result.ok) {
        console.error("notifyAdminsOfFeedback: mail was not accepted", {
          email,
          error: result.error,
        });
      }
    } catch (error) {
      console.error("notifyAdminsOfFeedback: mail failed", { email, error });
    }
  }
}
