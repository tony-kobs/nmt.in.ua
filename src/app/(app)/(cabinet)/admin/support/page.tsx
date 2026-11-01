import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SupportAdmin } from "@/components/support/SupportAdmin";
import { createPageMetadata } from "@/constants/seo";
import { requireUser } from "@/modules/auth/getCurrentUser";
import { hasPermission } from "@/modules/auth/permissions";
import { listSupportTickets, loadSupportMigrationNotice } from "@/modules/support/store";
import { parseTicketFilter } from "@/modules/support/text";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("Metadata.supportAdmin");
  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/admin/support",
    noIndex: true,
  });
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[]; saved?: string | string[]; error?: string | string[] }>;
}) {
  const user = await requireUser();
  if (!hasPermission(user.role, "marathon:manage")) redirect("/");
  const query = await searchParams;
  const filter = parseTicketFilter(first(query.status));
  const [tickets, migratedChatId] = await Promise.all([
    listSupportTickets(filter),
    loadSupportMigrationNotice(),
  ]);
  return (
    <SupportAdmin
      tickets={tickets}
      filter={filter}
      saved={first(query.saved) === "1"}
      error={first(query.error) ?? null}
      migratedChatId={migratedChatId}
    />
  );
}
