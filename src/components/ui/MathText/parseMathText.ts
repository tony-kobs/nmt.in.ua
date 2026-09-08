export type MathPart =
  | {
      type: "text";
      content: string;
    }
  | {
      type: "formula";
      content: string;
      displayMode: boolean;
    };

const DELIMITERS = [
  { open: "\\[", close: "\\]", displayMode: true },
  { open: "\\(", close: "\\)", displayMode: false },
  { open: "$$", close: "$$", displayMode: true },
  { open: "$", close: "$", displayMode: false },
] as const;

function isEscapedDollar(text: string, index: number) {
  return text[index] === "$" && text[index - 1] === "\\";
}

function findClose(text: string, from: number, close: string) {
  let index = from;

  while (index < text.length) {
    if (close === "$" && isEscapedDollar(text, index)) {
      index += 1;
      continue;
    }

    if (text.startsWith(close, index)) {
      return index;
    }

    index += 1;
  }

  return -1;
}

export function parseMathText(text: string): MathPart[] {
  const parts: MathPart[] = [];
  let cursor = 0;
  let textStart = 0;

  const pushText = (end: number) => {
    if (end > textStart) {
      parts.push({
        type: "text",
        content: text.slice(textStart, end),
      });
    }
  };

  while (cursor < text.length) {
    if (text.startsWith("\\$", cursor)) {
      cursor += 2;
      continue;
    }

    const delimiter = DELIMITERS.find(({ open }) => text.startsWith(open, cursor));

    if (!delimiter) {
      cursor += 1;
      continue;
    }

    const contentStart = cursor + delimiter.open.length;
    const closeIndex = findClose(text, contentStart, delimiter.close);

    if (closeIndex === -1) {
      cursor += 1;
      continue;
    }

    pushText(cursor);
    parts.push({
      type: "formula",
      content: text.slice(contentStart, closeIndex).trim(),
      displayMode: delimiter.displayMode,
    });

    cursor = closeIndex + delimiter.close.length;
    textStart = cursor;
  }

  pushText(text.length);

  return parts;
}
