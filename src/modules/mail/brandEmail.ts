/**
 * Marathon letter shell. Colors are the DesignBot palette for email only
 * (site tokens stay in globals.css). Inline styles, tables — Gmail and Outlook.
 */

export const EMAIL_PAGE = "#efe8d7";
export const EMAIL_PAPER = "#f3ecdb";
export const EMAIL_SURFACE = "#fdfbf4";
export const EMAIL_GREEN = "#1f8f45";
export const EMAIL_GREEN_DARK = "#11532a";
export const EMAIL_GRAD_FROM = "#2aa353";
export const EMAIL_GRAD_TO = "#14713a";
export const EMAIL_LINE = "#d2c7ae";
export const EMAIL_INK = "#1c1917";
export const EMAIL_LEAD = "#55503f";
export const EMAIL_FOOTER = "#6f675c";
export const EMAIL_CREAM = "#fdfbf4";

export const EMAIL_KICKER = "Марафон";
export const EMAIL_DAY_BADGE = "відкрито";
export const EMAIL_FINAL_GREETING = "Вітаємо";
export const EMAIL_CTA_LABEL = "Відкрити на сайті";
export const EMAIL_UNSUBSCRIBE_LABEL = "Відписатися від листів";
export const EMAIL_UNSUBSCRIBE_FALLBACK = "Вимкнути листи можна в кабінеті марафону.";

const FONT = "Segoe UI, Roboto, Helvetica, Arial, sans-serif";
const DISPLAY = "Georgia, 'Times New Roman', Times, serif";

export type MarathonEmailTone = "day_open" | "reminder" | "final" | "plain";

export function marathonEmailTone(kind: string | null | undefined): MarathonEmailTone {
  if (kind === "day_open" || kind === "reminder" || kind === "final") return kind;
  return "plain";
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const URL_LINE = /^https?:\/\/\S+$/i;

function tidyUrl(raw: string): string {
  return raw.replace(/[),.;:!?]+$/g, "");
}

export function splitMailBody(body: string): { title: string; lead: string; href: string | null } {
  let href: string | null = null;
  const kept: string[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!href && URL_LINE.test(line)) {
      href = tidyUrl(line);
      continue;
    }
    kept.push(raw.trimEnd());
  }
  const text = kept.join("\n").trim();
  if (!text) return { title: "", lead: "", href };
  const lines = text.split("\n");
  const title = (lines[0] ?? "").trim();
  const lead = lines.slice(1).join("\n").trim();
  return { title, lead, href };
}

function linkify(escaped: string): string {
  return escaped.replace(/https?:\/\/[^\s<]+/g, (raw) => {
    const href = tidyUrl(raw);
    const tail = raw.slice(href.length);
    return `<a href="${href}" style="color:${EMAIL_GREEN_DARK};text-decoration:underline;">${href}</a>${tail}`;
  });
}

function paragraph(text: string, style: string): string {
  const html = linkify(escapeHtml(text)).replaceAll("\n", "<br>");
  return `<p style="margin:0 0 12px;${style}">${html}</p>`;
}

function ctaBlock(href: string): string {
  const safe = escapeHtml(href);
  const label = escapeHtml(EMAIL_CTA_LABEL);
  return `
<tr>
  <td align="left" style="padding:4px 28px 0;">
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safe}" style="height:44px;v-text-anchor:middle;width:220px;" arcsize="50%" stroke="f" fillcolor="${EMAIL_GREEN}">
      <w:anchorlock/>
      <center style="color:${EMAIL_CREAM};font-family:Segoe UI,sans-serif;font-size:16px;font-weight:bold;">${label}</center>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-->
    <a href="${safe}" style="display:inline-block;padding:12px 28px;background-color:${EMAIL_GREEN};background-image:linear-gradient(90deg,${EMAIL_GRAD_FROM},${EMAIL_GRAD_TO});border-radius:999px;font-family:${FONT};font-size:16px;font-weight:700;line-height:20px;color:${EMAIL_CREAM};text-decoration:none;">${label}</a>
    <!--<![endif]-->
  </td>
</tr>
<tr>
  <td style="padding:10px 28px 8px;font-family:${FONT};font-size:12px;line-height:1.45;color:${EMAIL_FOOTER};word-break:break-all;">
    <a href="${safe}" style="color:${EMAIL_FOOTER};text-decoration:underline;">${safe}</a>
  </td>
</tr>`;
}

export function renderMarathonEmail(input: {
  body: string;
  tone?: MarathonEmailTone;
  unsubscribeUrl: string | null;
  logoUrl: string;
}): string {
  const tone = input.tone ?? "plain";
  const { title, lead, href } = splitMailBody(input.body);
  const preheader = escapeHtml(title || lead || EMAIL_KICKER);
  const titleWeight = tone === "reminder" ? "400" : "700";
  const festive = tone === "final"
    ? `<tr><td align="center" bgcolor="${EMAIL_GRAD_TO}" style="padding:10px 28px;background-color:${EMAIL_GRAD_TO};background-image:linear-gradient(90deg,${EMAIL_GRAD_FROM},${EMAIL_GRAD_TO});font-family:${DISPLAY};font-size:16px;line-height:1.3;color:${EMAIL_CREAM};">🏅&nbsp;&nbsp;π&nbsp;&nbsp;🏅</td></tr>`
    : "";
  const greeting = tone === "final"
    ? `<p style="margin:0 0 8px;font-family:${DISPLAY};font-size:20px;line-height:1.3;font-weight:700;color:${EMAIL_GREEN_DARK};">${EMAIL_FINAL_GREETING}</p>`
    : "";
  const badge = tone === "day_open"
    ? `<p style="margin:14px 0 0;"><span style="display:inline-block;padding:4px 12px;background:${EMAIL_GREEN};border-radius:999px;font-family:${FONT};font-size:12px;line-height:16px;font-weight:700;color:${EMAIL_CREAM};">${EMAIL_DAY_BADGE}</span></p>`
    : "";
  const titleHtml = title
    ? `<p style="margin:0 0 12px;font-family:${DISPLAY};font-size:26px;line-height:1.25;font-weight:${titleWeight};color:${EMAIL_INK};">${linkify(escapeHtml(title))}</p>`
    : "";
  const leadHtml = lead
    ? paragraph(lead, `font-family:${FONT};font-size:16px;line-height:1.55;color:${EMAIL_LEAD};`)
    : "";
  const footer = input.unsubscribeUrl
    ? `<a href="${escapeHtml(input.unsubscribeUrl)}" style="color:${EMAIL_FOOTER};text-decoration:underline;">${EMAIL_UNSUBSCRIBE_LABEL}</a>`
    : escapeHtml(EMAIL_UNSUBSCRIBE_FALLBACK);
  const logo = escapeHtml(input.logoUrl);

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${preheader}</title>
</head>
<body style="margin:0;padding:0;background:${EMAIL_PAGE};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:${EMAIL_PAGE};">
<tr>
<td align="center" style="padding:24px 16px;background:${EMAIL_PAGE};">
<!--[if mso]><table role="presentation" width="560" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;border-collapse:separate;background:${EMAIL_SURFACE};border:1px solid ${EMAIL_LINE};border-radius:20px;">
${festive}
<tr>
<td style="padding:24px 28px 20px;background:${EMAIL_PAPER};border-bottom:1px solid ${EMAIL_LINE};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td width="36" valign="middle" style="padding:0 12px 0 0;"><img src="${logo}" width="32" height="32" alt="" style="display:block;border:0;outline:none;text-decoration:none;"></td>
<td valign="middle" style="font-family:${FONT};">
<p style="margin:0;font-family:${DISPLAY};font-size:18px;line-height:1.2;font-weight:700;color:${EMAIL_INK};"><span style="color:${EMAIL_GREEN};">Level</span><span style="color:${EMAIL_GREEN_DARK};">UP</span></p>
<p style="margin:4px 0 0;font-family:${FONT};font-size:12px;line-height:1.3;font-weight:700;letter-spacing:0.04em;color:${EMAIL_GREEN};">${EMAIL_KICKER}</p>
</td>
</tr>
</table>
${badge}
</td>
</tr>
<tr>
<td style="padding:24px 28px 8px;font-family:${FONT};font-size:16px;line-height:1.55;color:${EMAIL_LEAD};">
${greeting}${titleHtml}${leadHtml}
</td>
</tr>
${href ? ctaBlock(href) : ""}
<tr>
<td style="padding:8px 28px 24px;border-top:1px solid ${EMAIL_LINE};font-family:${FONT};font-size:12px;line-height:1.45;color:${EMAIL_FOOTER};">
${footer}
</td>
</tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td>
</tr>
</table>
</body>
</html>`;
}
