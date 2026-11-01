import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm/ResetPasswordForm";
import { createPageMetadata } from "@/constants/seo";

export async function generateMetadata() {
  const t = await getTranslations("Metadata.resetPassword");

  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/reset-password",
    noIndex: true,
  });
}

type ResetPasswordPageProps = {
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const params = await searchParams;
  const raw = Array.isArray(params.token) ? params.token[0] : params.token;
  const token = (raw ?? "").trim();

  return (
    <AuthShell>
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
