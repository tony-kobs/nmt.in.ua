import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { TeacherRegisterResult } from "@/components/auth/TeacherRegisterResult";
import { createPageMetadata } from "@/constants/seo";
import { readPendingTeacherPayReferenceForTestBypass } from "@/modules/payments/actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("Metadata.teacherRegisterFail");

  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/register/teacher/fail",
    noIndex: true,
  });
}

export default async function TeacherRegisterFailPage() {
  const t = await getTranslations("TeacherRegister");
  const pendingReference = await readPendingTeacherPayReferenceForTestBypass();

  return (
    <AuthShell
      aside={{
        badge: t("asideBadge"),
        title: t("asideTitle"),
        lead: t("asideLead"),
      }}
    >
      <TeacherRegisterResult
        outcome="fail"
        reference={pendingReference}
        showTestBypass={Boolean(pendingReference)}
      />
    </AuthShell>
  );
}
