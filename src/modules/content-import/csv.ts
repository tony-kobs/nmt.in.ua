import type { RawRow } from "./validate";

/**
 * RFC 4180-style CSV parser: comma-separated, double-quote quoting,
 * `""` as an escaped quote inside a quoted field, and CRLF/LF/CR line
 * endings. No domain knowledge — returns a plain grid of strings.
 */
export function parseCsvTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldStarted = false;

  const endField = () => {
    row.push(field);
    field = "";
    fieldStarted = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  let i = 0;
  const len = text.length;
  while (i < len) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"' && field.length === 0 && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      endField();
      i += 1;
      continue;
    }
    if (char === "\r") {
      if (text[i + 1] === "\n") i += 1;
      endRow();
      i += 1;
      continue;
    }
    if (char === "\n") {
      endRow();
      i += 1;
      continue;
    }
    field += char;
    fieldStarted = true;
    i += 1;
  }

  if (inQuotes) {
    throw new Error("unterminated quoted field");
  }
  if (field.length > 0 || fieldStarted || row.length > 0) {
    endRow();
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/**
 * Splits a CSV document into a header check plus raw rows keyed by the
 * expected column names. Structural problems (parse failure, wrong header)
 * are returned as errors with no rows; per-cell validation is not performed
 * here — see `validate.ts`.
 */
export function parseCsvDataset(
  text: string,
  columns: readonly string[],
  datasetLabel: string,
  alternativeColumns: readonly (readonly string[])[] = [],
): { rows: RawRow[]; errors: string[] } {
  let table: string[][];

  try {
    table = parseCsvTable(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    return {
      rows: [],
      errors: [`${datasetLabel}: malformed CSV (${reason})`],
    };
  }

  if (table.length === 0) {
    return {
      rows: [],
      errors: [`${datasetLabel}: empty file`],
    };
  }

  const header = table[0];
  const acceptedColumns = [columns, ...alternativeColumns];
  const matchedColumns = acceptedColumns.find(
    (candidate) =>
      header.length === candidate.length &&
      header.every((value, index) => value === candidate[index]),
  );

  if (!matchedColumns) {
    const expectedHeaders = acceptedColumns
      .map((candidate) => `[${candidate.join(", ")}]`)
      .join(" or ");

    return {
      rows: [],
      errors: [
        `${datasetLabel}: expected header ${expectedHeaders}, got [${header.join(", ")}]`,
      ],
    };
  }

  const errors: string[] = [];
  const rows: RawRow[] = [];

  for (let index = 1; index < table.length; index += 1) {
    const values = table[index];
    const rowLabel = `${datasetLabel} row ${index + 1}`;

    if (values.length !== matchedColumns.length) {
      errors.push(
        `${rowLabel}: expected ${matchedColumns.length} columns, got ${values.length}`,
      );
      continue;
    }

    const raw: Record<string, unknown> = {};

    matchedColumns.forEach((column, columnIndex) => {
      raw[column] = values[columnIndex];
    });

    rows.push({ rowLabel, raw });
  }

  return { rows, errors };
}
