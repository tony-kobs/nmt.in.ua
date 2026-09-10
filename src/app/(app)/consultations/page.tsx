import { ConsultationsInbox } from "@/components/consultations/ConsultationsInbox";
import { ConsultationsStudentPanel } from "@/components/consultations/ConsultationsStudentPanel";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { getNavItem } from "@/constants/navigation";
import { createPageMetadata } from "@/constants/seo";
import { canReviewConsultationRequests } from "@/modules/auth/types";
import { requireUser } from "@/modules/auth/getCurrentUser";
import {
  getConsultationRequests,
  getOpenConsultationRequestForStudent,
} from "@/modules/consultations/getConsultationRequests";
import { toConsultationRequestView } from "@/modules/consultations/types";
import { getTranslations } from "next-intl/server";

const item = getNavItem("/consultations");

export async function generateMetadata() {
  const t = await getTranslations("Metadata.consultations");

  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: item.href,
  });
}

export default async function ConsultationsPage() {
  const user = await requireUser();
  const t = await getTranslations("Consultations");
  const reviewer = canReviewConsultationRequests(user.role);

  if (reviewer) {
    let rows: Awaited<ReturnType<typeof getConsultationRequests>> = [];
    try {
      rows = await getConsultationRequests();
    } catch (error) {
      console.error("consultations: getConsultationRequests failed", error);
    }

    return (
      <PageFrame kicker={t("kicker")} title={t("title")} lead={t("teacherLead")}>
        <ConsultationsInbox rows={rows.map(toConsultationRequestView)} />
      </PageFrame>
    );
  }

  let openRequest = null;
  try {
    const row = await getOpenConsultationRequestForStudent(user.id);
    openRequest = row ? toConsultationRequestView(row) : null;
  } catch (error) {
    console.error(
      "consultations: getOpenConsultationRequestForStudent failed",
      error,
    );
  }

  return (
    <PageFrame kicker={t("kicker")} title={t("title")} lead={t("studentLead")}>
      <ConsultationsStudentPanel openRequest={openRequest} />
    </PageFrame>
  );
}
