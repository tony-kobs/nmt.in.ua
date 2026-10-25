import { absoluteUrl } from "@/modules/mail/sendMail";
import {
  marathonEmailTone,
  renderMarathonEmail,
  type MarathonEmailTone,
} from "@/modules/mail/brandEmail";
import { copySubject } from "./copy";

function unsubscribeText(url: string | null): string {
  return url
    ? `\n\nВідписатися від листів марафону: ${url}`
    : "\n\nВимкнути листи можна в кабінеті марафону.";
}

function letterHtml(body: string, unsubscribeUrl: string | null, tone: MarathonEmailTone): string {
  return renderMarathonEmail({
    body,
    tone,
    unsubscribeUrl,
    logoUrl: absoluteUrl("/brand/levelup-book.png"),
  });
}

export function marathonMail(input: {
  kind: "day_open" | "reminder";
  title: string;
  dayNumber: number;
  topic: string;
  dayUrl: string;
  unsubscribeUrl: string | null;
}): { subject: string; text: string; html: string } {
  const title = input.title.trim();
  const topic = input.topic.trim();
  const subject =
    input.kind === "day_open"
      ? `Відкрито день ${input.dayNumber}: ${topic}`
      : `Нагадування: день ${input.dayNumber} ще не завершено`;
  const lead =
    input.kind === "day_open"
      ? `У марафоні «${title}» відкрився день ${input.dayNumber} — ${topic}.`
      : `У марафоні «${title}» день ${input.dayNumber} (${topic}) ще не завершено.`;
  const text = `${lead}\n\n${input.dayUrl}${unsubscribeText(input.unsubscribeUrl)}`;
  const html = letterHtml(`${lead}\n\n${input.dayUrl}`, input.unsubscribeUrl, input.kind);
  return { subject, text, html };
}

export function marathonBotText(input: {
  kind: "day_open" | "reminder";
  dayNumber: number;
  topic: string;
  dayUrl: string;
}): string {
  const lead =
    input.kind === "day_open"
      ? `Відкрито день ${input.dayNumber}: ${input.topic}.`
      : `Нагадування: день ${input.dayNumber} (${input.topic}) ще не завершено.`;
  return `${lead}\n${input.dayUrl}`;
}

export function wrapMarathonMail(input: {
  rendered: string;
  unsubscribeUrl: string | null;
  /** Notification kind. Unknown values use the plain shell. */
  kind?: string | null;
}): { subject: string; text: string; html: string } {
  const subject = copySubject(input.rendered, "Марафон");
  const body = input.rendered.trim();
  const text = `${body}${unsubscribeText(input.unsubscribeUrl)}`;
  const html = letterHtml(body, input.unsubscribeUrl, marathonEmailTone(input.kind));
  return { subject, text, html };
}

/** Activation invite. Plain text stays the sentence plus the public link. */
export function marathonInviteLetter(input: { body: string; link: string }): { text: string; html: string } {
  const text = `${input.body}\n${input.link}`;
  return { text, html: letterHtml(text, null, "plain") };
}

export function marathonDayUrl(slug: string, dayNumber: number): string {
  return absoluteUrl(`/marathon/${encodeURIComponent(slug)}/day/${dayNumber}`);
}
