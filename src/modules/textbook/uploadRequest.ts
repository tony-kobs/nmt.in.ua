/** CSRF gate for the textbook image upload. Browsers set `Sec-Fetch-Site`. */

export function textbookUploadAllowed(input: {
  host: string | null;
  origin: string | null;
  secFetchSite: string | null;
}): boolean {
  const site = input.secFetchSite?.trim().toLowerCase() ?? "";
  if (site === "cross-site") return false;
  if (site === "same-origin" || site === "same-site" || site === "none") return true;
  const host = input.host?.trim() ?? "";
  if (!input.origin || !host) return false;
  try {
    return new URL(input.origin).host === host;
  } catch {
    return false;
  }
}
