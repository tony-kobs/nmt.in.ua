/**
 * One reading of a bank prompt for search.
 * The SQL expression from `bankNormalizedSql` applies the same replacements,
 * then drops spaces, so the LIKE looks through the whole table rather than
 * the raw page of rows.
 */
const REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ["’", "'"],
  ["‘", "'"],
  ["ʼ", "'"],
  ["´", "'"],
  ["`", " "],
  ["$", " "],
  ["{", " "],
  ["}", " "],
  ["^", " "],
  ["_", " "],
  ["*", " "],
  ["#", " "],
  ["\\", " "],
  ["\n", " "],
  ["\r", " "],
  ["\t", " "],
];

export const BANK_PAGE_SIZE = 20;
export const BANK_SEARCH_DEBOUNCE_MS = 300;

export function normalizeBankSearchText(value: string): string {
  let text = value.normalize("NFKC");
  for (const [from, to] of REPLACEMENTS) text = text.split(from).join(to);
  return text.toLowerCase().replace(/\s+/g, "");
}

export function bankSearchId(query: string): string {
  const trimmed = query.trim();
  return /^[0-9]+$/.test(trimmed) ? trimmed.slice(0, 12) : "";
}

export function bankSearchLike(query: string): string {
  const escaped = normalizeBankSearchText(query).replace(/[\\%_]/g, "\\$&");
  return `%${escaped}%`;
}

function sqlString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

/** Nested REPLACE + LOWER + spaces removed. Same steps as `normalizeBankSearchText`. */
export function bankNormalizedSql(column: string): string {
  let expr = column;
  for (const [from, to] of REPLACEMENTS) {
    expr = `REPLACE(${expr}, ${sqlString(from)}, ${sqlString(to)})`;
  }
  return `REPLACE(LOWER(${expr}), ' ', '')`;
}

export type BankSearchState = {
  query: string;
  page: number;
  themeId: string;
  difficulty: string;
  optionCount: 0 | 2 | 4;
  subject: string;
  request: number;
};

export function beginBankSearch(
  state: BankSearchState,
  patch: Partial<Omit<BankSearchState, "request">>,
): BankSearchState {
  const queryChanged = patch.query !== undefined && patch.query !== state.query;
  const filterChanged =
    (patch.themeId !== undefined && patch.themeId !== state.themeId) ||
    (patch.difficulty !== undefined && patch.difficulty !== state.difficulty) ||
    (patch.optionCount !== undefined && patch.optionCount !== state.optionCount) ||
    (patch.subject !== undefined && patch.subject !== state.subject);
  const page = queryChanged || filterChanged ? 1 : Math.max(1, patch.page ?? state.page);
  return {
    ...state,
    ...patch,
    page,
    request: state.request + 1,
  };
}

/** A slower response must not replace a newer one. */
export function isLatestBankRequest(latest: number, issued: number): boolean {
  return latest === issued;
}

export function bankSearchPages(total: number, pageSize = BANK_PAGE_SIZE): number {
  if (!Number.isInteger(total) || total <= 0) return 1;
  return Math.ceil(total / pageSize);
}
