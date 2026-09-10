import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";

/** Shared tag for theme / variant reference lists invalidated after content import. */
export const CATALOG_CACHE_TAG = "catalog";

/** Default TTL — import also busts via `invalidateCatalogCache`. */
export const CATALOG_REVALIDATE_SEC = 60 * 60;

export function invalidateCatalogCache(): void {
  try {
    revalidateTag(CATALOG_CACHE_TAG, "max");
  } catch {
    // Unit tests / scripts call import outside a Next request store.
  }
}

/**
 * Next.js Data Cache wrapper for cross-request catalog reads.
 * Callers that inject a mock `getConnection` should skip this and hit the DB fn directly.
 */
export function cachedCatalogQuery<T>(
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  try {
    return unstable_cache(load, [key], {
      tags: [CATALOG_CACHE_TAG],
      revalidate: CATALOG_REVALIDATE_SEC,
    })();
  } catch {
    // Outside Next cache scope (tests) — just run the loader.
    return load();
  }
}
