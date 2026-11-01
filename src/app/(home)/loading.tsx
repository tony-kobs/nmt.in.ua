import { getLocale } from "next-intl/server";
import { StatusScene } from "@/components/status/StatusScene";
import { statusCopy } from "@/i18n/statusPages";

/**
 * Loading for `/` only. A `loading.tsx` beside the root `not-found.tsx`
 * streams HTTP 200 before an unknown URL can answer 404.
 */
export default async function HomeLoading() {
  const locale = await getLocale();
  return <StatusScene variant="loading" copy={statusCopy(locale)} />;
}
