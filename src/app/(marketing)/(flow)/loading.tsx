import { getLocale } from "next-intl/server";
import { StatusScene } from "@/components/status/StatusScene";
import { statusCopy } from "@/i18n/statusPages";

/**
 * Instant loading for marketing routes that do not call `notFound()`.
 * Marathon, teacher cards, and diagnostic sessions stay outside this
 * boundary so a missing resource can still return HTTP 404.
 */
export default async function MarketingLoading() {
  const locale = await getLocale();
  return <StatusScene variant="loading" copy={statusCopy(locale)} />;
}
