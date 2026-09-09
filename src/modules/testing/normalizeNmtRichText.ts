/**
 * Normalize УЦОЯО / nmt_quiz_tasks HTML leftovers into MathText-friendly plain text.
 * Import may still leave `<latex display="…">`, `<strong>`, etc. in the bank.
 */

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function latexTagsToDelimiters(html: string): string {
  return html.replace(/<latex\b[^>]*>([\s\S]*?)<\/latex>/gi, (_, body: string) => {
    let inner = body.trim();
    inner = inner
      .replace(/^\$\$([\s\S]*)\$\$$/, "$1")
      .replace(/^\\\(([\s\S]*)\\\)$/, "$1")
      .replace(/^\\\[([\s\S]*)\\\]$/, "$1")
      .trim();
    if (/\\begin\{/.test(inner) || /\n/.test(inner)) {
      return `$$${inner}$$`;
    }
    return `$${inner}$`;
  });
}

/**
 * Osvita sometimes nests delimiters: `$$\(...cases...\)$$`.
 * MathText then feeds KaTeX the literal `\(` / `\)` → red katex-error.
 */
function unwrapNestedMathDelimiters(text: string): string {
  let out = text;
  out = out.replace(
    /\$\$\s*\\\(\s*([\s\S]*?)\s*\\\)\s*\$\$/g,
    (_, body: string) => `$$${body.trim()}$$`,
  );
  out = out.replace(
    /\$\$\s*\\\[\s*([\s\S]*?)\s*\\\]\s*\$\$/g,
    (_, body: string) => `$$${body.trim()}$$`,
  );
  out = out.replace(
    /\\\(\s*(\\begin\{[a-z*]+\}[\s\S]*?\\end\{[a-z*]+\})\s*\\\)/gi,
    (_, body: string) => `$$${body.trim()}$$`,
  );
  return out;
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<p\b[^>]*>/gi, "")
    .replace(/<\/div>/gi, "\n")
    .replace(/<div\b[^>]*>/gi, "")
    .replace(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi, "![]($1)")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n");
}

/** Escape bare `%` outside formulas so KaTeX does not treat them as comments. */
function escapeBarePercents(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("$$", i)) {
      const end = text.indexOf("$$", i + 2);
      if (end === -1) {
        out += text.slice(i);
        break;
      }
      out += text.slice(i, end + 2);
      i = end + 2;
      continue;
    }
    if (text[i] === "$" && text[i - 1] !== "\\") {
      const end = text.indexOf("$", i + 1);
      if (end === -1) {
        out += text.slice(i);
        break;
      }
      out += text.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (text[i] === "%" && text[i - 1] !== "\\") {
      out += "\\%";
      i += 1;
      continue;
    }
    out += text[i];
    i += 1;
  }
  return out;
}

export function normalizeNmtRichText(raw: string | null | undefined): string {
  if (!raw) return "";
  let text = latexTagsToDelimiters(raw);
  text = stripTags(text);
  text = decodeEntities(text);
  text = unwrapNestedMathDelimiters(text);
  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n");
  text = text.replace(/[^\S\n]{2,}/g, " ").trim();
  return escapeBarePercents(text);
}

/** Comment body for mistake review: drop theme label noise, keep explanation. */
export function normalizeNmtComment(raw: string | null | undefined): string {
  let text = normalizeNmtRichText(raw);
  text = text.replace(/^Пояснення\s*/i, "");
  // Cyrillic is not an ASCII word char — avoid `\b` before `ТЕМА`.
  // Theme line usually ends before «Завдання» / «Перевірка».
  text = text.replace(
    /(?:^|\s)ТЕМА:\s*.+?(?=\s*(?:Завдання|Перевірка)\b)/giu,
    " ",
  );
  text = text.replace(/(?:^|\s)ТЕМА:\s*.+?\.\s*/giu, " ");
  return text.replace(/\s+/g, " ").trim();
}
