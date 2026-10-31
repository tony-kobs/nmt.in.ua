import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm/ForgotPasswordForm";
import { createPageMetadata } from "@/constants/seo";

export async function generateMetadata() {
  const t = await getTranslations("Metadata.forgotPassword");

  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/forgot-password",
    noIndex: true,
  });
}

export default async function ForgotPasswordPage() {
  return (
    <AuthShell>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
