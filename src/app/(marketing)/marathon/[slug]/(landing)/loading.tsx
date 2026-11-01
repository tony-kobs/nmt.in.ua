import { getLocale } from "next-intl/server";
import { StatusScene } from "@/components/status/StatusScene";
import { statusCopy } from "@/i18n/statusPages";

/** Shown only after the slug layout has already accepted the course. */
export default async function MarathonLandingLoading() {
  const locale = await getLocale();
  return <StatusScene variant="loading" copy={statusCopy(locale)} />;
}
