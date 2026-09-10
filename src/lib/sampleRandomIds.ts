/**
 * Pick up to `limit` distinct ids without MySQL `ORDER BY RAND()` (filesort).
 * Partial Fisher–Yates — O(n) copy + O(limit) swaps.
 */
export function sampleRandomIds(ids: readonly number[], limit: number): number[] {
  if (limit <= 0 || ids.length === 0) return [];
  const copy = ids.slice();
  const n = Math.min(limit, copy.length);
  for (let i = 0; i < n; i += 1) {
    const j = i + Math.floor(Math.random() * (copy.length - i));
    const a = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = a;
  }
  return copy.slice(0, n);
}

/** One random element, or `null` when the list is empty. */
export function pickRandomId(ids: readonly number[]): number | null {
  if (ids.length === 0) return null;
  return ids[Math.floor(Math.random() * ids.length)] ?? null;
}
