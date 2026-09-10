import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { TeacherRegisterForm } from "@/components/auth/TeacherRegisterForm";
import { createPageMetadata } from "@/constants/seo";
import { isMonoAcquiringConfigured } from "@/modules/payments/config";

/** Runtime env: CI build has no token; hosting `.env.production` may. */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("Metadata.teacherRegister");

  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/register/teacher",
  });
}

export default async function TeacherRegisterPage() {
  const t = await getTranslations("TeacherRegister");

  return (
    <AuthShell
      aside={{
        badge: t("asideBadge"),
        title: t("asideTitle"),
        lead: t("asideLead"),
      }}
    >
      <TeacherRegisterForm paymentConfigured={isMonoAcquiringConfigured()} />
    </AuthShell>
  );
}
