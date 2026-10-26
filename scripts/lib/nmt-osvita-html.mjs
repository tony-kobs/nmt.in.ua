/**
 * Shared HTML → task-text conversion for УЦОЯО pages on zno.osvita.ua.
 * Used by `scripts/fetch-nmt-variants.mjs` and the matching-task catalog.
 * The site reads MySQL; this module never writes the database.
 */

export const NMT_MATCH_OPEN = "[[nmt-match]]";
export const NMT_MATCH_CLOSE = "[[/nmt-match]]";

const CYRILLIC_MARKS = ["А", "Б", "В", "Г", "Д"];

export function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

export function latexToKatex(html) {
  return html
    .replace(/<latex\b[^>]*>([\s\S]*?)<\/latex>/gi, (_, body) => {
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
    })
    .replace(/<\/?span[^>]*>/gi, "");
}

export function htmlToTaskText(html) {
  let text = latexToKatex(html);
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n");
  text = text.replace(/<p[^>]*>/gi, "");
  text = text.replace(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi, "![]($1)");
  text = stripTags(text);
  text = text.replace(/<\/?[^>]+>/g, "");
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

export function parseAnswersBlock(blockHtml) {
  const answers = [];
  const re =
    /<div class="answer"><span class="marker">([А-ДA-Ea-e])<\/span>([\s\S]*?)<\/div>/gi;
  let match;
  while ((match = re.exec(blockHtml))) {
    answers.push(htmlToTaskText(match[2]));
  }
  return answers;
}

export function tipToKind(tip) {
  if (tip === 1) return "mcq";
  if (tip === 13) return "match";
  if (tip === 8) return "open";
  return null;
}

function markerRank(marker) {
  const ch = marker.trim().toUpperCase();
  const cyr = CYRILLIC_MARKS.indexOf(ch);
  if (cyr >= 0) return cyr;
  const lat = "ABCDE".indexOf(ch);
  return lat;
}

/**
 * Matching items live in two `.answers.col` columns, not in `.answers`.
 * The question div is only the stem. Returns null when the columns are absent.
 */
export function parseMatchColumns(chunk) {
  const parts = chunk.split(/<div class="answers col"[^>]*>/i).slice(1);
  if (parts.length < 2) return null;

  const columns = [];
  for (const part of parts.slice(0, 2)) {
    const end = part.search(
      /<\/div>\s*(?:<div class="answers|<div class="clear")/i,
    );
    const body = end === -1 ? part : part.slice(0, end);
    const titleMatch = /<div class="quest-title">([\s\S]*?)<\/div>/i.exec(body);
    const title = titleMatch ? htmlToTaskText(titleMatch[1]) : "";
    const items = [];
    const re =
      /<div class="answer"><span class="marker">([^<]*)<\/span>([\s\S]*?)<\/div>/gi;
    let match;
    while ((match = re.exec(body))) {
      items.push({
        marker: match[1].trim(),
        text: htmlToTaskText(match[2]),
      });
    }
    columns.push({ title, items });
  }

  const leftCol =
    columns.find((col) => col.items.some((item) => /^\d+$/.test(item.marker))) ??
    columns[0];
  const rightCol =
    columns.find(
      (col) =>
        col !== leftCol &&
        col.items.some((item) => markerRank(item.marker) >= 0),
    ) ?? columns[1];

  const left = [...(leftCol?.items ?? [])]
    .filter((item) => /^\d+$/.test(item.marker))
    .sort((a, b) => Number(a.marker) - Number(b.marker))
    .map((item) => item.text);

  const rightSlots = Array(5).fill("");
  for (const item of rightCol?.items ?? []) {
    const rank = markerRank(item.marker);
    if (rank >= 0 && rank < 5) rightSlots[rank] = item.text;
  }

  if (left.length === 0 && rightSlots.every((text) => !text)) return null;

  return {
    leftTitle: leftCol?.title ?? "",
    rightTitle: rightCol?.title ?? "",
    left,
    right: rightSlots,
  };
}

/** Append the column payload so a later import keeps it inside `task_text`. */
export function embedNmtMatch(stem, payload) {
  const body = JSON.stringify({
    leftTitle: payload.leftTitle ?? "",
    rightTitle: payload.rightTitle ?? "",
    left: payload.left ?? [],
    right: payload.right ?? [],
  });
  return `${stem.trim()}\n\n${NMT_MATCH_OPEN}\n${body}\n${NMT_MATCH_CLOSE}`;
}
