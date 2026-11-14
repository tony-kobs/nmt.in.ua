function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export type MdInline =
  | { type: "text"; text: string }
  | { type: "strong"; children: MdInline[] }
  | { type: "em"; children: MdInline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: MdInline[] };

export type MdBlock =
  | { type: "heading"; level: number; children: MdInline[] }
  | { type: "paragraph"; children: MdInline[] }
  | { type: "list"; items: MdInline[][] };

type Slot = { kind: "code" | "math"; value: string };

const MATH_OPENERS = [
  { open: "\\[", close: "\\]" },
  { open: "\\(", close: "\\)" },
  { open: "$$", close: "$$" },
  { open: "$", close: "$" },
] as const;

/** Page already has an h1, so one hash becomes h2 and `###` becomes h4. */
export function markdownHeadingRank(level: number): 2 | 3 | 4 | 5 | 6 {
  const rank = Math.min(Math.max(level + 1, 2), 6);
  if (rank === 2 || rank === 3 || rank === 4 || rank === 5 || rank === 6) return rank;
  return 6;
}

function isSafeHref(href: string): boolean {
  if (!/^https?:\/\//i.test(href)) return false;
  if (/[\s"'<>\\]/.test(href)) return false;
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function mathEnd(source: string, index: number): number {
  if (source.startsWith("\\$", index)) return -1;
  for (const delimiter of MATH_OPENERS) {
    if (!source.startsWith(delimiter.open, index)) continue;
    const from = index + delimiter.open.length;
    let cursor = from;
    while (cursor < source.length) {
      if (delimiter.close === "$" && source[cursor] === "$" && source[cursor - 1] === "\\") {
        cursor += 1;
        continue;
      }
      if (source.startsWith(delimiter.close, cursor)) return cursor + delimiter.close.length;
      cursor += 1;
    }
    return -1;
  }
  return -1;
}

/** Code and math stay opaque so `**` and `<` inside them are not markup. */
function shield(source: string): { text: string; slots: Slot[] } {
  const slots: Slot[] = [];
  let text = "";
  let index = 0;
  while (index < source.length) {
    if (source[index] === "`") {
      const end = source.indexOf("`", index + 1);
      if (end !== -1) {
        const id = slots.length;
        slots.push({ kind: "code", value: source.slice(index + 1, end) });
        text += `\uE000${id}\uE001`;
        index = end + 1;
        continue;
      }
    }
    const end = mathEnd(source, index);
    if (end !== -1) {
      const id = slots.length;
      slots.push({ kind: "math", value: source.slice(index, end) });
      text += `\uE000${id}\uE001`;
      index = end;
      continue;
    }
    text += source[index];
    index += 1;
  }
  return { text, slots };
}

function restoreMath(text: string, slots: Slot[]): string {
  return text.replace(/\uE000(\d+)\uE001/g, (token, id: string) => {
    const slot = slots[Number(id)];
    return slot?.kind === "math" ? slot.value : token;
  });
}

function mergeText(nodes: MdInline[]): MdInline[] {
  const merged: MdInline[] = [];
  for (const node of nodes) {
    const previous = merged[merged.length - 1];
    if (node.type === "text" && previous?.type === "text") {
      previous.text += node.text;
      continue;
    }
    merged.push(node.type === "text" ? { type: "text", text: node.text } : node);
  }
  return merged;
}

function parseMarks(text: string, slots: Slot[]): MdInline[] {
  const nodes: MdInline[] = [];
  let plain = "";
  let index = 0;
  const pushPlain = () => {
    if (plain === "") return;
    nodes.push({ type: "text", text: restoreMath(plain, slots) });
    plain = "";
  };

  while (index < text.length) {
    const token = /^\uE000(\d+)\uE001/.exec(text.slice(index));
    if (token) {
      const slot = slots[Number(token[1])];
      if (slot?.kind === "code") {
        pushPlain();
        nodes.push({ type: "code", text: slot.value });
      } else if (slot?.kind === "math") {
        plain += slot.value;
      } else {
        plain += token[0];
      }
      index += token[0].length;
      continue;
    }
    if (text.startsWith("**", index)) {
      const end = text.indexOf("**", index + 2);
      if (end !== -1) {
        pushPlain();
        nodes.push({ type: "strong", children: parseMarks(text.slice(index + 2, end), slots) });
        index = end + 2;
        continue;
      }
    }
    if (text[index] === "*" && text[index + 1] !== "*") {
      const end = text.indexOf("*", index + 1);
      if (end !== -1) {
        pushPlain();
        nodes.push({ type: "em", children: parseMarks(text.slice(index + 1, end), slots) });
        index = end + 1;
        continue;
      }
    }
    const link = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/.exec(text.slice(index));
    if (link && isSafeHref(link[2] ?? "")) {
      pushPlain();
      nodes.push({
        type: "link",
        href: link[2] ?? "",
        children: parseMarks(link[1] ?? "", slots),
      });
      index += link[0].length;
      continue;
    }
    plain += text[index];
    index += 1;
  }
  pushPlain();
  return mergeText(nodes);
}

function parseInline(source: string): MdInline[] {
  const shielded = shield(source);
  return parseMarks(shielded.text, shielded.slots);
}

/** Small markdown subset. Raw HTML is never kept: text is escaped on render. */
export function parseSafeMarkdown(source: string): MdBlock[] {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const blocks: MdBlock[] = [];
  let list: MdInline[][] = [];
  const flushList = () => {
    if (list.length === 0) return;
    blocks.push({ type: "list", items: list });
    list = [];
  };
  for (const line of lines) {
    const item = /^-\s+(.+)$/.exec(line);
    if (item) {
      list.push(parseInline(item[1] ?? ""));
      continue;
    }
    flushList();
    if (!line.trim()) continue;
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: (heading[1] ?? "#").length,
        children: parseInline(heading[2] ?? ""),
      });
      continue;
    }
    blocks.push({ type: "paragraph", children: parseInline(line) });
  }
  flushList();
  return blocks;
}

function htmlInline(nodes: MdInline[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text") return escapeHtml(node.text);
      if (node.type === "code") return `<code>${escapeHtml(node.text)}</code>`;
      if (node.type === "strong") return `<strong>${htmlInline(node.children)}</strong>`;
      if (node.type === "em") return `<em>${htmlInline(node.children)}</em>`;
      return `<a href="${escapeHtml(node.href)}" rel="noopener noreferrer">${htmlInline(node.children)}</a>`;
    })
    .join("");
}

/** Markdown subset as HTML. Text is escaped, so raw HTML cannot survive. */
export function renderSafeMarkdown(source: string): string {
  return parseSafeMarkdown(source)
    .map((block) => {
      if (block.type === "heading") {
        const tag = `h${markdownHeadingRank(block.level)}`;
        return `<${tag}>${htmlInline(block.children)}</${tag}>`;
      }
      if (block.type === "list") {
        return `<ul>${block.items.map((item) => `<li>${htmlInline(item)}</li>`).join("")}</ul>`;
      }
      return `<p>${htmlInline(block.children)}</p>`;
    })
    .join("");
}

export function youtubeEmbedSrc(raw: string): string | null {
  const value = raw.trim();
  let id = "";
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (url.pathname === "/watch") id = url.searchParams.get("v") ?? "";
      else {
        const parts = url.pathname.split("/").filter(Boolean);
        if (parts[0] === "embed" || parts[0] === "shorts") id = parts[1] ?? "";
      }
    }
  } catch {
    return null;
  }
  if (!/^[\w-]{6,16}$/.test(id)) return null;
  return `https://www.youtube-nocookie.com/embed/${id}`;
}

export function loomEmbedSrc(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.replace(/^www\./, "");
    if (host !== "loom.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "share" && parts[0] !== "embed") return null;
    const id = parts[1] ?? "";
    if (!/^[a-zA-Z0-9]{8,40}$/.test(id)) return null;
    return `https://www.loom.com/embed/${id}`;
  } catch {
    return null;
  }
}
