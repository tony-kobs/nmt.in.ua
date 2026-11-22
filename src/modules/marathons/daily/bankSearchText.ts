/**
 * One reading of a bank prompt for search.
 * The database only filters theme, difficulty and option count.
 * Words, spaces, apostrophes and formulas are compared here, so MySQL and
 * MariaDB never have to run a nested REPLACE.
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

/** Text match runs in JS so MySQL and MariaDB never see nested REPLACE. */
export function matchesBankQuery(input: {
  id: number;
  name: string;
  prompt: string;
  query: string;
}): boolean {
  const needle = normalizeBankSearchText(input.query);
  if (!needle) return true;
  const id = bankSearchId(input.query);
  if (id && String(input.id) === id) return true;
  return normalizeBankSearchText(`${input.name} ${input.prompt}`).includes(needle);
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
