import { getLocale } from "next-intl/server";
import { StatusScene } from "@/components/status/StatusScene";
import { statusCopy } from "@/i18n/statusPages";

/**
 * Instant loading for cabinet routes that do not call `notFound()`.
 * Detail routes that can be missing stay outside this boundary so their
 * `notFound()` still sets HTTP 404.
 */
export default async function AppLoading() {
  const locale = await getLocale();
  return (
    <StatusScene variant="loading" copy={statusCopy(locale)} layout="embed" />
  );
}
