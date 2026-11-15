import { getTranslations } from "next-intl/server";
import { PageFrame, PagePanel } from "@/components/dashboard/PageFrame";
import { createPageMetadata } from "@/constants/seo";
import { notFound } from "next/navigation";
import { requireRole } from "@/modules/auth/getCurrentUser";
import { loadParentDashboard } from "@/modules/parent-students/loadParentDashboard";
import { ParentAccessError } from "@/modules/parent-students/types";
import { ParentChildSelect } from "@/components/dashboard/ParentDashboard/ParentChildSelect";
import { ParentProgress } from "@/components/dashboard/ParentDashboard/ParentProgress";

export async function generateMetadata() {
  const t = await getTranslations("ParentDashboard");

  return createPageMetadata({
    title: t("title"),
    description: t("lead"),
    path: "/parent",
    noIndex: true,
  });
}

export default async function ParentPage({ searchParams }: {
  searchParams: Promise<{ childId?: string | string[] }>;
}) {
  await requireRole(["parent"]);
  const t = await getTranslations("ParentDashboard");
  const { childId } = await searchParams;
  let data;
  try {
    data = await loadParentDashboard(childId);
  } catch (error) {
    if (error instanceof ParentAccessError) notFound();
    throw error;
  }

  return (
    <PageFrame title={t("title")} lead={t("lead")}>
      {data.progress === null ? (
        <PagePanel><p role="status">{t("noChildren")}</p></PagePanel>
      ) : (
        <>
          {data.children.length > 1 ? (
            <PagePanel>
              <ParentChildSelect roster={data.children} selectedId={data.progress.child.id} />
            </PagePanel>
          ) : null}
          <ParentProgress progress={data.progress} />
        </>
      )}
    </PageFrame>
  );
}
