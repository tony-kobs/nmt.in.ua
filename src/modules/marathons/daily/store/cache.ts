import "server-only";

import { revalidateTag } from "next/cache";

export const MARATHON_HOME_CACHE_TAG = "marathon-home";

export function invalidateMarathonHomeCache(): void {
  try {
    revalidateTag(MARATHON_HOME_CACHE_TAG, "max");
  } catch {
    // Unit tests call marathon writes outside a Next request store.
  }
}
