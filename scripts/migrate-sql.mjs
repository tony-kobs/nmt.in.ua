/** Statement splitter and errno policy shared by `npm run migrate` and tests. */

const IGNORABLE_ERRNO = new Set([
  1022, // ER_DUP_KEY
  1050, // ER_TABLE_EXISTS_ERROR
  1060, // ER_DUP_FIELDNAME
  1061, // ER_DUP_KEYNAME
  1062, // ER_DUP_ENTRY (one-time flag inserts)
  1091, // ER_CANT_DROP_FIELD_OR_KEY
  1826, // ER_FK_DUP_NAME
]);

export function isIgnorableMigrationErrno(errno) {
  return IGNORABLE_ERRNO.has(Number(errno));
}

function isWhitespace(ch) {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f";
}

/**
 * Splits a MySQL script into statements.
 *
 * Semicolons inside `'...'`, `"..."`, and `` `...` `` are not terminators.
 * Quotes honor backslash escapes and doubled-quote escapes. `--` (when it
 * starts a MySQL comment), `#`, and `/* *\/` comments are dropped, including
 * any semicolons inside them. A client `DELIMITER` directive changes the
 * terminator and is not itself returned.
 */
export function splitSqlStatements(source) {
  const text = String(source).replace(/^\uFEFF/, "");
  const statements = [];
  let delimiter = ";";
  let buffer = "";
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === "-" && text[i + 1] === "-" && (text[i + 2] === undefined || isWhitespace(text[i + 2]))) {
      i += 2;
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }

    if (ch === "#") {
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }

    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      if (i < text.length) i += 2;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
      const quote = ch;
      buffer += quote;
      i += 1;
      while (i < text.length) {
        const inner = text[i];
        if (inner === "\\") {
          buffer += inner;
          i += 1;
          if (i < text.length) {
            buffer += text[i];
            i += 1;
          }
          continue;
        }
        if (inner === quote) {
          buffer += quote;
          i += 1;
          if (text[i] === quote) {
            buffer += quote;
            i += 1;
            continue;
          }
          break;
        }
        buffer += inner;
        i += 1;
      }
      continue;
    }

    if ((ch === "d" || ch === "D") && buffer.trim() === "") {
      const match = /^delimiter(?:[ \t]+(\S+))?[ \t]*(?:\r?\n|$)/i.exec(text.slice(i));
      if (match) {
        if (match[1]) delimiter = match[1];
        i += match[0].length;
        buffer = "";
        continue;
      }
    }

    if (text.startsWith(delimiter, i)) {
      const statement = buffer.trim();
      if (statement.length > 0) statements.push(statement);
      buffer = "";
      i += delimiter.length;
      continue;
    }

    buffer += ch;
    i += 1;
  }

  const tail = buffer.trim();
  if (tail.length > 0) statements.push(tail);
  return statements;
}
