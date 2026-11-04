/**
 * Task prose should stay in the UI font.
 * A bare number, a number with a unit, or a punctuation dash before a measure
 * is not a formula. An em dash inside `$…$` otherwise becomes a minus.
 * A straight apostrophe between letters is the Ukrainian ʼ.
 */

const APOSTROPHE = "ʼ";

const UNIT =
  "см|мм|дм|км|м|кг|г|хв|год|л|мл|грн";

function unwrapTextCommand(formula: string): string {
  return formula
    .replace(/\\(?:text|mathrm)\{([^{}]*)\}/g, "$1")
    .replace(/[{}~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Plain reading of a trivial formula, or null when KaTeX should keep it. */
export function proseFromFormula(formula: string): string | null {
  const src = unwrapTextCommand(formula);
  if (!src || /[\\^_=<>]|[A-Za-z]/.test(src)) return null;

  const punctuated = src.match(
    new RegExp(
      String.raw`^([—–])\s*(\d+(?:[.,]\d+)?)\s*(?:(${UNIT}))?$`,
      "u",
    ),
  );
  if (punctuated) {
    const unit = punctuated[3] ? ` ${punctuated[3]}` : "";
    return `— ${punctuated[2]}${unit}`;
  }

  const spacedSign = src.match(
    new RegExp(
      String.raw`^[−\-]\s+(\d+(?:[.,]\d+)?)\s*(?:(${UNIT}))?$`,
      "u",
    ),
  );
  if (spacedSign) {
    const unit = spacedSign[2] ? ` ${spacedSign[2]}` : "";
    return `— ${spacedSign[1]}${unit}`;
  }

  const signed = src.match(
    new RegExp(
      String.raw`^[−\-](\d+(?:[.,]\d+)?)\s*(?:(${UNIT}))?$`,
      "u",
    ),
  );
  if (signed) {
    const unit = signed[2] ? ` ${signed[2]}` : "";
    return `−${signed[1]}${unit}`;
  }

  const plain = src.match(
    new RegExp(
      String.raw`^(\d+(?:[.,]\d+)?)\s*(?:(${UNIT}|°|%))?$`,
      "u",
    ),
  );
  if (!plain) return null;
  if (!plain[2]) return plain[1];
  if (plain[2] === "%" || plain[2] === "°") return `${plain[1]}${plain[2]}`;
  return `${plain[1]} ${plain[2]}`;
}

function fixApostrophes(text: string): string {
  return text.replace(
    /(?<=\p{L})['’'](?=\p{L})/gu,
    APOSTROPHE,
  );
}

type Chunk = { type: "text" | "formula"; content: string; display: boolean };

function splitMath(text: string): Chunk[] {
  const chunks: Chunk[] = [];
  const pattern = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$]+)\$/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      chunks.push({ type: "text", content: text.slice(cursor, index), display: false });
    }
    const body = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
    const display = Boolean(match[1] || match[2]);
    chunks.push({ type: "formula", content: body, display });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) {
    chunks.push({ type: "text", content: text.slice(cursor), display: false });
  }
  return chunks;
}

/** Soften task text before MathText parses delimiters. */
export function presentTaskText(text: string): string {
  if (!text) return "";
  return splitMath(text)
    .map((chunk) => {
      if (chunk.type === "text") return fixApostrophes(chunk.content);
      if (chunk.display) {
        return `$$${chunk.content}$$`;
      }
      const prose = proseFromFormula(chunk.content);
      return prose ?? `$${chunk.content}$`;
    })
    .join("");
}
