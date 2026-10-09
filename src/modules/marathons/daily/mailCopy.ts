import { absoluteUrl } from "@/modules/mail/sendMail";
import { copySubject } from "./copy";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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
  const unsubscribe = input.unsubscribeUrl
    ? `\n\nВідписатися від листів марафону: ${input.unsubscribeUrl}`
    : "\n\nВимкнути листи можна в кабінеті марафону.";
  const text = `${lead}\n\n${input.dayUrl}${unsubscribe}`;
  const unsubHtml = input.unsubscribeUrl
    ? `<p><a href="${escapeHtml(input.unsubscribeUrl)}">Відписатися від листів</a></p>`
    : "<p>Вимкнути листи можна в кабінеті марафону.</p>";
  const html = `<p>${escapeHtml(lead)}</p><p><a href="${escapeHtml(input.dayUrl)}">Відкрити день</a></p>${unsubHtml}`;
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
}): { subject: string; text: string; html: string } {
  const subject = copySubject(input.rendered, "Марафон");
  const body = input.rendered.trim();
  const unsubscribe = input.unsubscribeUrl
    ? `\n\nВідписатися від листів марафону: ${input.unsubscribeUrl}`
    : "\n\nВимкнути листи можна в кабінеті марафону.";
  const text = `${body}${unsubscribe}`;
  const unsubHtml = input.unsubscribeUrl
    ? `<p><a href="${escapeHtml(input.unsubscribeUrl)}">Відписатися від листів</a></p>`
    : "<p>Вимкнути листи можна в кабінеті марафону.</p>";
  const html = body
    .split(/\n{2,}/)
    .map((part) => `<p>${escapeHtml(part).replaceAll("\n", "<br>")}</p>`)
    .join("") + unsubHtml;
  return { subject, text, html };
}

export function marathonDayUrl(slug: string, dayNumber: number): string {
  return absoluteUrl(`/marathon/${encodeURIComponent(slug)}/day/${dayNumber}`);
}
