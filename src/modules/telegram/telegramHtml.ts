const TELEGRAM_HTML_LIMIT = 4096;

export function escapeTelegramHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function inline(value: string): string {
  return value
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>")
    .replace(
      /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2">$1</a>',
    );
}

/** Markdown subset to Telegram HTML. Raw HTML is escaped, so it cannot run. */
export function markdownToTelegramHtml(source: string): string {
  const escaped = escapeTelegramHtml(source.replaceAll("\r\n", "\n"));
  const lines = escaped.split("\n");
  const blocks: string[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (list.length === 0) return;
    blocks.push(list.join("\n"));
    list = [];
  };
  for (const line of lines) {
    const item = /^-\s+(.+)$/.exec(line);
    if (item) {
      list.push(`• ${inline(item[1] ?? "")}`);
      continue;
    }
    flushList();
    blocks.push(inline(line));
  }
  flushList();
  return blocks.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function cutOutsideTag(value: string, limit: number): number {
  let end = Math.min(limit, value.length);
  const open = value.lastIndexOf("<", end);
  const close = value.lastIndexOf(">", end);
  if (open > close && open > 0) end = open;
  const anchorStart = value.lastIndexOf("<a ", end);
  if (anchorStart >= 0) {
    const anchorEnd = value.indexOf("</a>", anchorStart);
    if (anchorEnd !== -1 && anchorEnd + 4 > end) {
      const anchorLength = anchorEnd + 4 - anchorStart;
      if (anchorLength <= limit && anchorStart > 0) end = anchorStart;
      else if (anchorEnd + 4 <= limit) end = anchorEnd + 4;
    }
  }
  return Math.max(1, Math.min(end, value.length));
}

function splitLong(value: string, limit: number): string[] {
  const lines = value.split("\n");
  const chunks: string[] = [];
  let current = "";
  const pushLine = (line: string) => {
    if (!current) current = line;
    else if (current.length + 1 + line.length <= limit) current = `${current}\n${line}`;
    else {
      chunks.push(current);
      current = line;
    }
  };
  for (const line of lines) {
    if (line.length <= limit) {
      pushLine(line);
      continue;
    }
    if (current) {
      chunks.push(current);
      current = "";
    }
    let rest = line;
    while (rest.length > limit) {
      const end = cutOutsideTag(rest, limit);
      chunks.push(rest.slice(0, end));
      rest = rest.slice(end);
    }
    if (rest) pushLine(rest);
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Pack Telegram HTML on paragraph breaks, staying under the message limit. */
export function splitTelegramHtml(source: string, limit = TELEGRAM_HTML_LIMIT): string[] {
  const clean = source.replaceAll("\r\n", "\n").trim();
  if (!clean) return [];
  if (clean.length <= limit) return [clean];
  const paragraphs = clean.split(/\n\n/);
  const chunks: string[] = [];
  let current = "";
  const push = (part: string) => {
    if (!part) return;
    if (!current) current = part;
    else if (current.length + 2 + part.length <= limit) current = `${current}\n\n${part}`;
    else {
      chunks.push(current);
      current = part;
    }
  };
  for (const paragraph of paragraphs) {
    if (paragraph.length <= limit) {
      push(paragraph);
      continue;
    }
    if (current) {
      chunks.push(current);
      current = "";
    }
    for (const piece of splitLong(paragraph, limit)) push(piece);
  }
  if (current) chunks.push(current);
  return chunks.filter((chunk) => chunk.length > 0 && chunk.length <= limit);
}

export { TELEGRAM_HTML_LIMIT };
