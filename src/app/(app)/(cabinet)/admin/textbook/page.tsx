import { TextbookSectionList } from "@/components/admin/TextbookEditor";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { createPageMetadata } from "@/constants/seo";
import { getTextbookBlocks } from "@/content/learningMaterials/textbook";
import { requireRole } from "@/modules/auth/getCurrentUser";
import { getThemes } from "@/modules/themes/getThemes";
import { listTextbookSectionStates } from "@/modules/textbook/store";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("TextbookEditor");
  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/admin/textbook",
    noIndex: true,
  });
}

export default async function AdminTextbookPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  await requireRole(["admin"]);
  const t = await getTranslations("TextbookEditor");
  const query = await searchParams;
  const error = Array.isArray(query.error) ? query.error[0] : query.error;
  const [themes, states] = await Promise.all([
    getThemes(),
    listTextbookSectionStates(),
  ]);

  return (
    <PageFrame kicker={t("kicker")} title={t("title")} lead={t("listLead")}>
      <TextbookSectionList
        error={error === "code" || error === "theme" ? error : null}
        items={themes.map((theme) => {
          const state = states.get(theme.code);
          return {
            code: theme.code,
            name: theme.name,
            published: state?.published ?? false,
            draft: state?.draft ?? false,
            fromConspect: getTextbookBlocks(theme.code).length > 0,
          };
        })}
      />
    </PageFrame>
  );
}
