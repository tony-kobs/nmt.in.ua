import { getLocale } from "next-intl/server";
import { StatusScene } from "@/components/status/StatusScene";
import { statusCopy } from "@/i18n/statusPages";

export default async function RootLoading() {
  const locale = await getLocale();
  return <StatusScene variant="loading" copy={statusCopy(locale)} />;
}
